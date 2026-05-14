<script setup lang="ts">
import type { Location, Booth, HallLayoutData, DetectedBooth } from '~/stores/events'
import { useAuthStore } from '~/stores/auth'
import { useLocale } from '~/composables/useLocale'

const props = defineProps<{
  location: Location
  selectedBoothId: string | null
}>()

const emit = defineEmits<{
  selectBooth: [id: string | null]
  addDetectedBooth: [boothNr: string]
  createManualBooth: [
    data: { name: string; boothNr: string; hallNr: string; website: string; notes: string },
    imageIdx: number,
    rect: { x: number; y: number; w: number; h: number },
  ]
  placeExistingBooth: [boothId: string, imageIdx: number, rect: { x: number; y: number; w: number; h: number }]
  removeDetectedBooth: [imageIdx: number, boothNr: string]
  deleteBooth: [boothId: string]
}>()

const authStore = useAuthStore()
const { t } = useLocale()

// ── Layout data ────────────────────────────────────────────────────────
const layoutData = computed<HallLayoutData | null>(() => {
  if (!props.location.layoutData) return null
  try { return JSON.parse(props.location.layoutData) } catch { return null }
})

const planImages = computed(() => layoutData.value?.images ?? [])
const currentImageIdx = ref(0)
const currentPlanImage = computed(() => planImages.value[currentImageIdx.value] ?? null)

// ── User booth lookup by boothNr ───────────────────────────────────────
const boothByNr = computed(() => {
  const map = new Map<string, Booth>()
  for (const b of props.location.booths ?? []) {
    if (b.boothNr) map.set(b.boothNr.toUpperCase(), b)
  }
  return map
})

function getUserBooth(detectedNr: string): Booth | undefined {
  return boothByNr.value.get(detectedNr.toUpperCase())
}

const unmappedUserBooths = computed<Booth[]>(() => {
  const allUserBooths = props.location.booths ?? []
  if (!currentPlanImage.value) return allUserBooths
  const detectedNrs = new Set(currentPlanImage.value.booths.map(b => b.boothNr.toUpperCase()))
  return allUserBooths.filter(b => !b.boothNr || !detectedNrs.has(b.boothNr.toUpperCase()))
})

const allDetectedBooths = computed<DetectedBooth[]>(() => {
  const seen = new Set<string>()
  const result: DetectedBooth[] = []
  for (const img of planImages.value) {
    for (const b of img.booths) {
      if (!seen.has(b.boothNr)) {
        seen.add(b.boothNr)
        result.push(b)
      }
    }
  }
  return result.sort((a, b) => a.boothNr.localeCompare(b.boothNr))
})

// ── View mode + search ─────────────────────────────────────────────────
const viewMode = ref<'map' | 'list'>('map')
const searchQuery = ref('')

// When true, the underlying floor plan image is hidden and only the SVG
// rendering is shown — a clean redrawn-map view with gray boxes + labels.
const showImage = ref(true)

const filteredListBooths = computed(() => {
  const q = searchQuery.value.trim().toUpperCase()
  if (!q) return allDetectedBooths.value
  return allDetectedBooths.value.filter(b => b.boothNr.includes(q))
})

function isSearchMatch(boothNr: string): boolean {
  const q = searchQuery.value.trim().toUpperCase()
  return q !== '' && boothNr.includes(q)
}

// ── Zoom / Pan ─────────────────────────────────────────────────────────
const zoom = ref(1)
const pan = ref({ x: 20, y: 20 })
const isPanning = ref(false)
const lastMouse = ref({ x: 0, y: 0 })
const mapContainerRef = ref<HTMLElement>()

function onWheel(e: WheelEvent) {
  e.preventDefault()
  const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12
  zoom.value = Math.max(0.15, Math.min(6, zoom.value * factor))
}

function resetZoom() {
  zoom.value = 1
  pan.value = { x: 20, y: 20 }
}

function panToBooth(b: DetectedBooth) {
  const vw = mapContainerRef.value?.clientWidth ?? 900
  const vh = mapContainerRef.value?.clientHeight ?? 580
  pan.value = {
    x: vw / 2 - (b.x + b.w / 2) * zoom.value,
    y: vh / 2 - (b.y + b.h / 2) * zoom.value,
  }
}

function focusBooth(boothNr: string) {
  for (let i = 0; i < planImages.value.length; i++) {
    const b = planImages.value[i].booths.find(b => b.boothNr === boothNr)
    if (b) {
      currentImageIdx.value = i
      viewMode.value = 'map'
      nextTick(() => panToBooth(b))
      return b
    }
  }
}

function onListBoothClick(b: DetectedBooth) {
  const userBooth = getUserBooth(b.boothNr)
  if (userBooth) {
    focusBooth(b.boothNr)
    emit('selectBooth', userBooth.id === props.selectedBoothId ? null : userBooth.id)
  } else {
    emit('addDetectedBooth', b.boothNr)
  }
}

// ── Manual draw mode ───────────────────────────────────────────────────
const drawMode = ref(false)
const drawStart = ref<{ x: number; y: number } | null>(null)
const liveDraw = ref<{ x: number; y: number; w: number; h: number } | null>(null)
const pendingDraw = ref<{ x: number; y: number; w: number; h: number } | null>(null)
const manualForm = reactive({ name: '', boothNr: '', hallNr: '', website: '', notes: '' })

// Pattern replication — when the user draws one booth, they can also create
// N siblings in one of the four cardinal directions, with the booth number
// auto-incremented based on the pattern. Avoids retyping for the typical grid
// floor plan where booths sit in regular rows/columns.
type ReplicateDirection = 'right' | 'left' | 'up' | 'down'
const replicateForm = reactive<{ count: number; direction: ReplicateDirection }>({
  count: 1,
  direction: 'right',
})

/**
 * Auto-increment a booth number along a direction.
 *   - 'up' / 'down'    → step the trailing number
 *   - 'left' / 'right' → step the letter section (skipping 'I' — most venues
 *                        skip it because it looks like the digit 1)
 *
 * Defaults match a typical convention floor plan where letters DECREASE going
 * right (e.g. 10N → 10M → 10L → 10K → 10J → 10H) and numbers DECREASE going
 * down. The user can flip direction if their layout differs.
 *
 * Returns null if the increment runs out of bounds (e.g. letter past 'Z').
 */
function incrementBoothNr(nr: string, direction: ReplicateDirection, step: number): string | null {
  const m = nr.match(/^(\d{0,2})([A-Z]+)?(\d{1,4})$/i)
  if (!m) return null
  const hallPart = m[1] || ''
  const letterPart = (m[2] || '').toUpperCase()
  const numPart = m[3]
  const padLength = numPart.length

  if (direction === 'up' || direction === 'down') {
    const delta = direction === 'up' ? step : -step
    const next = parseInt(numPart, 10) + delta
    if (next < 0) return null
    return `${hallPart}${letterPart}${String(next).padStart(padLength, '0')}`
  }

  // Horizontal direction → letter shift
  if (!letterPart) return null
  const lastChar = letterPart.charCodeAt(letterPart.length - 1)
  const delta = direction === 'left' ? step : -step
  let nextCode = lastChar + delta
  // Skip 'I' (charCode 73) if the new letter would cross it
  while ((delta > 0 && lastChar < 73 && nextCode >= 73 && nextCode <= 73 + Math.abs(delta) - 1)
      || (delta < 0 && lastChar > 73 && nextCode <= 73 && nextCode >= 73 - Math.abs(delta) + 1)) {
    nextCode += delta > 0 ? 1 : -1
  }
  if (nextCode < 65 || nextCode > 90) return null
  const newLetter = letterPart.slice(0, -1) + String.fromCharCode(nextCode)
  return `${hallPart}${newLetter}${numPart}`
}

function computeOffset(direction: ReplicateDirection, step: number, w: number, h: number) {
  const GAP = 2  // small pixel gap so replicas don't visually merge
  switch (direction) {
    case 'right': return { dx: step * (w + GAP), dy: 0 }
    case 'left':  return { dx: -step * (w + GAP), dy: 0 }
    case 'down':  return { dx: 0, dy: step * (h + GAP) }
    case 'up':    return { dx: 0, dy: -step * (h + GAP) }
  }
}

// Preview of the booth numbers that will be created (including the seed).
const replicatePreview = computed<string[]>(() => {
  if (replicateForm.count <= 1 || !manualForm.boothNr.trim()) return []
  const out: string[] = [manualForm.boothNr.trim().toUpperCase()]
  for (let i = 1; i < replicateForm.count; i++) {
    const next = incrementBoothNr(manualForm.boothNr.trim(), replicateForm.direction, i)
    if (!next) break
    out.push(next)
  }
  return out
})

// ── Place existing booth mode ──────────────────────────────────────────
const placingBooth = ref<Booth | null>(null)
const pendingPlace = ref<{ x: number; y: number; w: number; h: number } | null>(null)

// When true, clicking a gray (detected) booth removes it from the OCR layout.
// Mutually exclusive with drawMode.
const removeMode = ref(false)

function startPlacing(booth: Booth) {
  if (placingBooth.value?.id === booth.id) {
    cancelPlace()
    return
  }
  drawMode.value = false
  cancelManualBooth()
  placingBooth.value = booth
  pendingPlace.value = null
}

function cancelPlace() {
  placingBooth.value = null
  pendingPlace.value = null
  liveDraw.value = null
  drawStart.value = null
}

function deletePlacingBooth() {
  if (!placingBooth.value) return
  const target = placingBooth.value
  // Confirm before destroying — this also wipes the booth's products + images.
  if (typeof window !== 'undefined' && !window.confirm(`Delete "${target.name}" and all its products / images?`)) {
    return
  }
  emit('deleteBooth', target.id)
  cancelPlace()
}

async function confirmPlace() {
  if (!pendingPlace.value || !placingBooth.value) return
  emit('placeExistingBooth', placingBooth.value.id, currentImageIdx.value, { ...pendingPlace.value })
  pendingPlace.value = null
  placingBooth.value = null
}

function getImageCoords(e: MouseEvent): { x: number; y: number } {
  const container = mapContainerRef.value
  if (!container) return { x: 0, y: 0 }
  const r = container.getBoundingClientRect()
  return {
    x: (e.clientX - r.left - pan.value.x) / zoom.value,
    y: (e.clientY - r.top - pan.value.y) / zoom.value,
  }
}

function toggleDrawMode() {
  drawMode.value = !drawMode.value
  if (drawMode.value) removeMode.value = false
  if (!drawMode.value) cancelManualBooth()
}

function cancelManualBooth() {
  pendingDraw.value = null
  liveDraw.value = null
  drawStart.value = null
  Object.assign(manualForm, { name: '', boothNr: '', hallNr: '', website: '', notes: '' })
}

async function saveManualBooth() {
  if (!manualForm.name.trim() || !pendingDraw.value) return
  const seedRect = { ...pendingDraw.value }
  const seedForm = { ...manualForm }
  const imageIdx = currentImageIdx.value

  // First (seed) booth — keeps the name, website, and notes the user typed.
  emit('createManualBooth', seedForm, imageIdx, seedRect)

  // Replicas: same position offset along the chosen direction, booth number
  // auto-incremented. Name defaults to the new boothNr (or "<seed name> 2", "3"
  // if no booth number is provided). Website and notes are NOT copied.
  if (replicateForm.count > 1) {
    for (let i = 1; i < replicateForm.count; i++) {
      const offset = computeOffset(replicateForm.direction, i, seedRect.w, seedRect.h)
      const nextBoothNr = seedForm.boothNr
        ? incrementBoothNr(seedForm.boothNr, replicateForm.direction, i)
        : null
      // Stop early if the booth-number sequence runs out (e.g. past 'Z')
      if (seedForm.boothNr && !nextBoothNr) break
      const name = nextBoothNr || `${seedForm.name} ${i + 1}`
      emit('createManualBooth',
        { name, boothNr: nextBoothNr ?? '', hallNr: seedForm.hallNr, website: '', notes: '' },
        imageIdx,
        { x: seedRect.x + offset.dx, y: seedRect.y + offset.dy, w: seedRect.w, h: seedRect.h },
      )
    }
  }

  pendingDraw.value = null
  drawMode.value = false
  Object.assign(manualForm, { name: '', boothNr: '', hallNr: '', website: '', notes: '' })
  replicateForm.count = 1
}

// ── Mouse handlers (pan + draw + place) ───────────────────────────────
const isDrawing = computed(() => drawMode.value || !!placingBooth.value)

function onMouseDown(e: MouseEvent) {
  // In drawing/placing mode the user needs to drag over existing booths to
  // pick a position, so we must NOT bail out when the mousedown happens on
  // top of one. The booth-rect click handlers themselves use @click.stop so
  // a non-drag click on a booth still works in normal mode.
  if (isDrawing.value && authStore.isEditing) {
    e.preventDefault()
    const c = getImageCoords(e)
    drawStart.value = c
    liveDraw.value = { x: c.x, y: c.y, w: 0, h: 0 }
    if (drawMode.value) pendingDraw.value = null
    else pendingPlace.value = null
    return
  }

  // Not drawing/placing: clicks on existing booths are handled by their own
  // @click handler. Don't start panning when the user clicks a booth.
  if ((e.target as Element).closest('.booth-rect')) return

  isPanning.value = true
  lastMouse.value = { x: e.clientX, y: e.clientY }
}

function onMouseMove(e: MouseEvent) {
  if (isDrawing.value && drawStart.value) {
    const c = getImageCoords(e)
    liveDraw.value = {
      x: Math.min(drawStart.value.x, c.x),
      y: Math.min(drawStart.value.y, c.y),
      w: Math.abs(c.x - drawStart.value.x),
      h: Math.abs(c.y - drawStart.value.y),
    }
    return
  }
  if (!isPanning.value) return
  pan.value.x += e.clientX - lastMouse.value.x
  pan.value.y += e.clientY - lastMouse.value.y
  lastMouse.value = { x: e.clientX, y: e.clientY }
}

function onMouseUp() {
  if (isDrawing.value && drawStart.value && liveDraw.value) {
    if (liveDraw.value.w > 8 && liveDraw.value.h > 8) {
      if (drawMode.value) {
        pendingDraw.value = { ...liveDraw.value }
        Object.assign(manualForm, { name: '', boothNr: '', hallNr: '', website: '', notes: '' })
      } else {
        pendingPlace.value = { ...liveDraw.value }
      }
    }
    liveDraw.value = null
    drawStart.value = null
    return
  }
  isPanning.value = false
}

// ── Booth colors ───────────────────────────────────────────────────────
function boothColor(booth: Booth): string {
  const products = booth.products ?? []
  if (!products.length) return '#f97316'
  if (products.every(p => p.isPurchased)) return '#22c55e'
  if (products.some(p => p.isPurchased)) return '#eab308'
  return '#a855f8'
}

function boothFillOpacity(booth: Booth): number {
  if (!props.selectedBoothId) return 0.72
  return props.selectedBoothId === booth.id ? 0.92 : 0.28
}

function boothBorderColor(booth: Booth): string {
  if (props.selectedBoothId === booth.id) return '#ffffff'
  return boothColor(booth)
}
</script>

<template>
  <div class="space-y-3">
    <div v-if="!layoutData" class="bg-gray-900 rounded-xl p-10 text-center text-gray-500">
      <UIcon name="i-heroicons-map" class="w-12 h-12 mx-auto mb-3 text-gray-600" />
      <p class="font-medium">{{ t('hallplan.noSetup') }}</p>
      <p class="text-sm mt-1">{{ t('hallplan.noSetupHintA') }} <span class="text-purple-400">{{ t('hallplan.setupHallPlan') }}</span> {{ t('hallplan.noSetupHintB') }}</p>
    </div>

    <div v-else class="space-y-3">
      <!-- Search bar + view toggle -->
      <div class="flex items-center gap-2">
        <UInput
          v-model="searchQuery"
          :placeholder="t('hallplan.searchPlaceholder')"
          icon="i-heroicons-magnifying-glass"
          size="sm"
          class="flex-1"
          :ui="{ icon: { trailing: { pointer: '' } } }"
        >
          <template v-if="searchQuery" #trailing>
            <UButton variant="link" color="gray" icon="i-heroicons-x-mark" size="xs" @click="searchQuery = ''" />
          </template>
        </UInput>
        <UButton
          v-if="viewMode === 'map'"
          size="sm" variant="outline" color="gray"
          :icon="showImage ? 'i-heroicons-eye-slash' : 'i-heroicons-photo'"
          :title="showImage ? t('hallplan.hideImage') : t('hallplan.showImage')"
          @click="showImage = !showImage"
        />
        <UButton
          size="sm" variant="outline" color="gray"
          :icon="viewMode === 'map' ? 'i-heroicons-list-bullet' : 'i-heroicons-map'"
          @click="viewMode = viewMode === 'map' ? 'list' : 'map'"
        >
          {{ viewMode === 'map' ? t('hallplan.listView') : t('hallplan.mapView') }}
        </UButton>
      </div>

      <!-- ── MAP VIEW ──────────────────────────────────────────────────── -->
      <template v-if="viewMode === 'map'">
        <!-- Map page tabs -->
        <div v-if="planImages.length > 1" class="flex gap-2 flex-wrap">
          <button
            v-for="(img, idx) in planImages" :key="img.id"
            :class="[
              'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border',
              currentImageIdx === idx
                ? 'bg-purple-600 border-purple-500 text-white'
                : 'bg-gray-900 border-gray-700 text-gray-400 hover:border-gray-600 hover:text-white',
            ]"
            @click="currentImageIdx = idx"
          >
            {{ t('hallplan.mapLabel') }} {{ idx + 1 }}
            <span class="ml-1.5 opacity-60">{{ img.booths.length }} {{ t('events.booths') }}</span>
          </button>
        </div>

        <!-- Legend + controls -->
        <div class="flex items-center gap-3 text-xs text-gray-400 flex-wrap">
          <span class="flex items-center gap-1.5"><span class="w-3 h-3 rounded-sm bg-orange-500 inline-block" />{{ t('hallplan.legendAdded') }}</span>
          <span class="flex items-center gap-1.5"><span class="w-3 h-3 rounded-sm bg-violet-500 inline-block" />{{ t('hallplan.legendPlanned') }}</span>
          <span class="flex items-center gap-1.5"><span class="w-3 h-3 rounded-sm bg-yellow-500 inline-block" />{{ t('hallplan.legendPartial') }}</span>
          <span class="flex items-center gap-1.5"><span class="w-3 h-3 rounded-sm bg-green-500 inline-block" />{{ t('hallplan.legendAllBought') }}</span>
          <span class="flex items-center gap-1.5">
            <span class="w-3 h-3 rounded-sm border border-gray-500 inline-block opacity-60" />
            {{ t('hallplan.legendDetected') }}
          </span>

          <div class="ml-auto flex items-center gap-2">
            <!-- Draw mode toggle (edit mode only) -->
            <UButton
              v-if="authStore.isEditing"
              size="xs"
              :variant="drawMode ? 'solid' : 'outline'"
              :color="drawMode ? 'purple' : 'gray'"
              icon="i-heroicons-pencil-square"
              @click="toggleDrawMode"
            >
              {{ drawMode ? t('hallplan.drawMode') : t('hallplan.drawBooth') }}
            </UButton>

            <!-- Remove-detected toggle: click detected (gray) booths to remove
                 them from the OCR layout. Useful for clearing false positives. -->
            <UButton
              v-if="authStore.isEditing"
              size="xs"
              :variant="removeMode ? 'solid' : 'outline'"
              :color="removeMode ? 'red' : 'gray'"
              icon="i-heroicons-trash"
              :title="t('hallplan.removeDetectedHint')"
              @click="removeMode = !removeMode; if (removeMode) drawMode = false"
            >
              {{ removeMode ? t('hallplan.removeMode') : t('hallplan.removeDetected') }}
            </UButton>

            <UButton size="xs" variant="ghost" color="gray" icon="i-heroicons-magnifying-glass-minus"
              @click="zoom = Math.max(0.15, zoom - 0.15)" />
            <span class="w-12 text-center">{{ Math.round(zoom * 100) }}%</span>
            <UButton size="xs" variant="ghost" color="gray" icon="i-heroicons-magnifying-glass-plus"
              @click="zoom = Math.min(6, zoom + 0.15)" />
            <UButton size="xs" variant="ghost" color="gray" icon="i-heroicons-arrows-pointing-in" @click="resetZoom" />
          </div>
        </div>

        <!-- Draw mode hint -->
        <div v-if="drawMode" class="px-3 py-2 bg-purple-900/30 border border-purple-700/40 rounded-lg text-xs text-purple-300 flex items-center gap-2">
          <UIcon name="i-heroicons-pencil-square" class="w-3.5 h-3.5 shrink-0" />
          {{ t('hallplan.drawHint') }}
          <UButton size="xs" variant="link" color="gray" class="ml-auto" @click="toggleDrawMode">{{ t('common.cancel') }}</UButton>
        </div>

        <!-- Place existing booth hint -->
        <div v-if="placingBooth && !drawMode" class="px-3 py-2 bg-orange-900/30 border border-orange-700/40 rounded-lg text-xs text-orange-300 flex items-center gap-2">
          <UIcon name="i-heroicons-map-pin" class="w-3.5 h-3.5 shrink-0" />
          {{ t('hallplan.placeHintA') }} <span class="font-semibold text-orange-200 mx-1">{{ placingBooth.name }}</span>
          <span v-if="placingBooth.boothNr" class="font-mono bg-orange-900/50 px-1 rounded">{{ placingBooth.boothNr }}</span> {{ t('hallplan.placeHintB') }}
          <div class="ml-auto flex items-center gap-1">
            <UButton size="xs" variant="link" color="gray" @click="cancelPlace">{{ t('common.cancel') }}</UButton>
            <UButton
              size="xs" variant="link" color="red"
              icon="i-heroicons-trash"
              :title="t('hallplan.deleteThisBooth')"
              @click="deletePlacingBooth"
            >{{ t('common.delete') }}</UButton>
          </div>
        </div>

        <!-- Map viewport -->
        <div
          v-if="currentPlanImage"
          ref="mapContainerRef"
          class="relative bg-gray-950 rounded-xl overflow-hidden border border-gray-800 select-none"
          :style="{ cursor: isDrawing ? 'crosshair' : isPanning ? 'grabbing' : 'grab', height: '580px' }"
          @wheel.prevent="onWheel"
          @mousedown="onMouseDown"
          @mousemove="onMouseMove"
          @mouseup="onMouseUp"
          @mouseleave="onMouseUp"
        >
          <!-- Pannable + zoomable content -->
          <div
            class="absolute top-0 left-0"
            :style="{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: '0 0',
              width: currentPlanImage.naturalWidth + 'px',
              height: currentPlanImage.naturalHeight + 'px',
            }"
          >
            <img
              v-if="showImage"
              :src="currentPlanImage.path"
              class="block"
              :width="currentPlanImage.naturalWidth"
              :height="currentPlanImage.naturalHeight"
              draggable="false"
              decoding="async"
            />
            <!-- Map-only mode: render a clean light background where the image
                 would normally sit, so SVG rects + labels read on their own. -->
            <div
              v-else
              class="bg-gray-100 dark:bg-gray-900 border border-gray-300 dark:border-gray-700"
              :style="{ width: currentPlanImage.naturalWidth + 'px', height: currentPlanImage.naturalHeight + 'px' }"
            />

            <svg
              class="absolute inset-0"
              :width="currentPlanImage.naturalWidth"
              :height="currentPlanImage.naturalHeight"
              :viewBox="`0 0 ${currentPlanImage.naturalWidth} ${currentPlanImage.naturalHeight}`"
              style="pointer-events: none"
            >
              <!-- Detected untracked booths -->
              <rect
                v-for="b in currentPlanImage.booths.filter(b => !getUserBooth(b.boothNr))"
                :key="`det-${b.boothNr}`"
                :x="b.x" :y="b.y" :width="b.w" :height="b.h" rx="3"
                :fill="removeMode
                  ? 'rgba(239,68,68,0.18)'
                  : (isSearchMatch(b.boothNr)
                      ? 'rgba(168,85,247,0.25)'
                      : (showImage ? 'rgba(156,163,175,0.07)' : 'rgba(229,231,235,0.9)'))"
                :stroke="removeMode
                  ? '#ef4444'
                  : (isSearchMatch(b.boothNr)
                      ? '#a855f8'
                      : (showImage ? 'rgba(156,163,175,0.45)' : 'rgba(107,114,128,0.85)'))"
                :stroke-width="isSearchMatch(b.boothNr) || removeMode ? 2.5 : 1.5"
                class="booth-rect"
                style="pointer-events: all; cursor: pointer"
                @click.stop="removeMode
                  ? emit('removeDetectedBooth', currentImageIdx, b.boothNr)
                  : (!drawMode && emit('addDetectedBooth', b.boothNr))"
              >
                <title>{{ removeMode ? `${b.boothNr} — click to remove` : `${b.boothNr} — click to add` }}</title>
              </rect>

              <!-- Detected-booth labels: shown for every box in map-only mode
                   (no image to read the number off of), or just for search
                   matches when the image is visible. -->
              <text
                v-for="b in currentPlanImage.booths.filter(b => !getUserBooth(b.boothNr) && (!showImage || isSearchMatch(b.boothNr)))"
                :key="`det-lbl-${b.boothNr}`"
                :x="b.x + b.w / 2" :y="b.y + b.h / 2 + 4"
                text-anchor="middle" :font-size="Math.min(12, b.h * 0.45)"
                font-weight="bold"
                :fill="isSearchMatch(b.boothNr) ? '#a855f8' : '#374151'"
                font-family="ui-monospace, monospace"
                style="pointer-events: none"
              >{{ b.boothNr }}</text>

              <!-- User booths -->
              <g
                v-for="b in currentPlanImage.booths.filter(b => getUserBooth(b.boothNr))"
                :key="`user-${b.boothNr}`"
                class="booth-rect"
                style="pointer-events: all; cursor: pointer"
                @click.stop="!drawMode && emit('selectBooth', getUserBooth(b.boothNr)!.id === selectedBoothId ? null : getUserBooth(b.boothNr)!.id)"
              >
                <rect
                  :x="b.x" :y="b.y" :width="b.w" :height="b.h" rx="3"
                  :fill="boothColor(getUserBooth(b.boothNr)!)"
                  :fill-opacity="boothFillOpacity(getUserBooth(b.boothNr)!)"
                  :stroke="boothBorderColor(getUserBooth(b.boothNr)!)"
                  :stroke-width="selectedBoothId === getUserBooth(b.boothNr)!.id ? 2.5 : 1.5"
                />
                <text
                  :x="b.x + b.w / 2" :y="b.y + b.h / 2 + 4"
                  text-anchor="middle" :font-size="Math.min(12, b.h * 0.45)"
                  font-weight="bold" fill="white" font-family="ui-monospace, monospace"
                  style="pointer-events: none"
                >{{ b.boothNr }}</text>
              </g>

              <!-- Live draw rect -->
              <rect
                v-if="liveDraw"
                :x="liveDraw.x" :y="liveDraw.y" :width="liveDraw.w" :height="liveDraw.h"
                rx="3"
                :fill="placingBooth ? 'rgba(249,115,22,0.15)' : 'rgba(168,85,247,0.15)'"
                :stroke="placingBooth ? '#f97316' : '#a855f7'"
                stroke-width="2" stroke-dasharray="6 3" style="pointer-events: none"
              />

              <!-- Pending new booth rect -->
              <rect
                v-if="pendingDraw"
                :x="pendingDraw.x" :y="pendingDraw.y" :width="pendingDraw.w" :height="pendingDraw.h"
                rx="3" fill="rgba(168,85,247,0.2)" stroke="#a855f7" stroke-width="2.5"
                style="pointer-events: none"
              />

              <!-- Pending place rect -->
              <rect
                v-if="pendingPlace"
                :x="pendingPlace.x" :y="pendingPlace.y" :width="pendingPlace.w" :height="pendingPlace.h"
                rx="3" fill="rgba(249,115,22,0.2)" stroke="#f97316" stroke-width="2.5"
                style="pointer-events: none"
              />
            </svg>
          </div>

          <!-- Manual booth form overlay -->
          <div
            v-if="pendingDraw"
            class="absolute top-3 right-3 w-72 bg-gray-900 border border-purple-600/60 rounded-xl shadow-2xl p-4 z-20 space-y-3"
            @mousedown.stop
          >
            <div class="flex items-center justify-between mb-1">
              <p class="text-sm font-semibold text-purple-300 flex items-center gap-1.5">
                <UIcon name="i-heroicons-pencil-square" class="w-4 h-4" />
                {{ t('hallplan.newBooth') }}
              </p>
              <UButton icon="i-heroicons-x-mark" variant="ghost" color="gray" size="xs" @click="cancelManualBooth" />
            </div>

            <UFormGroup :label="t('hallplan.boothName')" required>
              <UInput v-model="manualForm.name" :placeholder="t('addBooth.namePlaceholder')" size="sm" autofocus />
            </UFormGroup>

            <div class="grid grid-cols-2 gap-2">
              <UFormGroup :label="t('booth.boothNrLabel')">
                <UInput v-model="manualForm.boothNr" :placeholder="t('hallplan.boothNrPlaceholder')" size="sm" />
              </UFormGroup>
              <UFormGroup :label="t('booth.hallNrLabel')">
                <UInput v-model="manualForm.hallNr" :placeholder="t('hallplan.hallNrPlaceholder')" size="sm" />
              </UFormGroup>
            </div>

            <UFormGroup :label="t('common.website')">
              <UInput v-model="manualForm.website" placeholder="https://…" size="sm" />
            </UFormGroup>

            <UFormGroup :label="t('common.notes')">
              <UInput v-model="manualForm.notes" :placeholder="t('hallplan.notesPlaceholder')" size="sm" />
            </UFormGroup>

            <!-- Pattern replication: draw one booth, fill a whole row/column.
                 Disabled when there's no booth number to auto-increment. -->
            <div class="border-t border-gray-800 pt-2 space-y-2">
              <p class="text-xs font-medium text-gray-400">{{ t('hallplan.replicate') }}</p>
              <div class="flex items-center gap-2">
                <label class="text-xs text-gray-500 shrink-0">{{ t('hallplan.replicateCount') }}</label>
                <UInput
                  v-model.number="replicateForm.count"
                  type="number" min="1" max="50" size="xs" class="w-16"
                  :disabled="!manualForm.boothNr.trim()"
                />
                <div class="flex gap-0.5 ml-auto" :class="manualForm.boothNr.trim() ? '' : 'opacity-40 pointer-events-none'">
                  <button v-for="d in (['left','right','up','down'] as ReplicateDirection[])" :key="d"
                    type="button"
                    class="w-7 h-7 rounded text-xs font-medium border transition-colors flex items-center justify-center"
                    :class="replicateForm.direction === d
                      ? 'border-purple-500 bg-purple-500/20 text-purple-300'
                      : 'border-gray-700 text-gray-400 hover:border-gray-500 hover:text-white'"
                    :title="t('hallplan.direction' + d.charAt(0).toUpperCase() + d.slice(1))"
                    @click="replicateForm.direction = d"
                  >
                    <UIcon
                      :name="d === 'left' ? 'i-heroicons-arrow-left'
                           : d === 'right' ? 'i-heroicons-arrow-right'
                           : d === 'up' ? 'i-heroicons-arrow-up'
                           : 'i-heroicons-arrow-down'"
                      class="w-3.5 h-3.5"
                    />
                  </button>
                </div>
              </div>
              <div v-if="replicatePreview.length > 1" class="text-xs text-gray-500 leading-relaxed">
                <span class="text-gray-400">{{ t('hallplan.replicatePreview') }}:</span>
                <span class="font-mono ml-1">{{ replicatePreview.join(', ') }}</span>
              </div>
            </div>

            <div class="flex gap-2 pt-1">
              <UButton color="purple" size="sm" :disabled="!manualForm.name.trim()" class="flex-1" @click="saveManualBooth">
                {{ replicatePreview.length > 1
                  ? t('hallplan.addNBooths').replace('{n}', String(replicatePreview.length))
                  : t('hallplan.addBooth') }}
              </UButton>
              <UButton variant="ghost" color="gray" size="sm" @click="cancelManualBooth">{{ t('common.cancel') }}</UButton>
            </div>
          </div>

          <!-- Place existing booth confirmation overlay -->
          <div
            v-if="pendingPlace && placingBooth"
            class="absolute top-3 right-3 w-64 bg-gray-900 border border-orange-600/60 rounded-xl shadow-2xl p-4 z-20 space-y-3"
            @mousedown.stop
          >
            <div class="flex items-center justify-between">
              <p class="text-sm font-semibold text-orange-300 flex items-center gap-1.5">
                <UIcon name="i-heroicons-map-pin" class="w-4 h-4" />
                {{ t('hallplan.placeHere') }}
              </p>
              <UButton icon="i-heroicons-x-mark" variant="ghost" color="gray" size="xs" @click="cancelPlace" />
            </div>
            <div>
              <div class="text-sm font-medium text-white">{{ placingBooth.name }}</div>
              <div v-if="placingBooth.boothNr || placingBooth.hallNr" class="flex gap-1.5 mt-1">
                <span v-if="placingBooth.hallNr" class="text-xs text-gray-400">{{ t('booth.hallLabel') }} {{ placingBooth.hallNr }}</span>
                <span v-if="placingBooth.boothNr" class="text-xs font-mono bg-gray-800 px-1.5 py-0.5 rounded text-purple-300">{{ placingBooth.boothNr }}</span>
              </div>
            </div>
            <div class="flex gap-2">
              <UButton color="orange" size="sm" class="flex-1" @click="confirmPlace">{{ t('common.confirm') }}</UButton>
              <UButton variant="ghost" color="gray" size="sm" @click="cancelPlace">{{ t('common.cancel') }}</UButton>
            </div>
          </div>

          <div class="absolute bottom-2 right-2 text-xs text-gray-600 pointer-events-none select-none">
            {{ t('hallplan.scrollHint') }}
          </div>
        </div>

        <!-- User booths not on this map -->
        <div v-if="unmappedUserBooths.length" class="bg-gray-900 rounded-lg p-3">
          <div class="flex items-center justify-between mb-2">
            <p class="text-xs text-gray-500">{{ t('hallplan.notDetectedOnMap') }}</p>
            <p v-if="authStore.isEditing" class="text-xs text-orange-400/70">{{ t('hallplan.clickToPlace') }}</p>
          </div>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="b in unmappedUserBooths" :key="b.id"
              class="px-2 py-1 rounded text-xs font-medium transition-colors flex items-center gap-1"
              :class="placingBooth?.id === b.id
                ? 'bg-orange-500 text-white ring-2 ring-orange-400'
                : selectedBoothId === b.id
                  ? 'bg-orange-500 text-white'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'"
              @click="authStore.isEditing ? startPlacing(b) : emit('selectBooth', b.id === selectedBoothId ? null : b.id)"
            >
              <UIcon v-if="authStore.isEditing" name="i-heroicons-map-pin" class="w-3 h-3 opacity-70" />
              {{ b.name }}{{ b.boothNr ? ` (${b.boothNr})` : '' }}
            </button>
          </div>
        </div>
      </template>

      <!-- ── LIST VIEW ─────────────────────────────────────────────────── -->
      <template v-else>
        <div class="bg-gray-900 rounded-xl border border-gray-800 p-4">
          <div class="text-xs text-gray-500 mb-3">
            {{ filteredListBooths.length }} booth{{ filteredListBooths.length !== 1 ? 's' : '' }}
            across {{ planImages.length }} map page{{ planImages.length !== 1 ? 's' : '' }}
            — <span class="text-orange-400">colored = in your list</span> · <span class="text-gray-400">gray = detected, click to add</span>
          </div>

          <div v-if="filteredListBooths.length" class="flex flex-wrap gap-1.5 max-h-96 overflow-y-auto">
            <button
              v-for="b in filteredListBooths" :key="b.boothNr"
              class="px-2 py-1 rounded text-xs font-mono font-semibold transition-all border"
              :class="getUserBooth(b.boothNr)
                ? [selectedBoothId === getUserBooth(b.boothNr)!.id ? 'ring-2 ring-white scale-105' : 'opacity-90 hover:opacity-100', 'text-white border-transparent']
                : 'bg-gray-800 text-gray-400 border-gray-700 hover:border-gray-500 hover:text-white'"
              :style="getUserBooth(b.boothNr) ? { backgroundColor: boothColor(getUserBooth(b.boothNr)!) } : {}"
              @click="onListBoothClick(b)"
            >
              {{ b.boothNr }}
            </button>
          </div>

          <p v-else class="text-sm text-gray-500 text-center py-6">
            No booths match "{{ searchQuery }}"
          </p>
        </div>
      </template>
    </div>
  </div>
</template>
