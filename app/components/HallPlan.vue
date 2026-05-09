<script setup lang="ts">
import type { Location, Booth, HallLayoutData, DetectedBooth } from '~/stores/events'
import { useAuthStore } from '~/stores/auth'

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
}>()

const authStore = useAuthStore()

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
  emit('createManualBooth', { ...manualForm }, currentImageIdx.value, { ...pendingDraw.value })
  pendingDraw.value = null
  drawMode.value = false
  Object.assign(manualForm, { name: '', boothNr: '', hallNr: '', website: '', notes: '' })
}

// ── Mouse handlers (pan + draw) ────────────────────────────────────────
function onMouseDown(e: MouseEvent) {
  if ((e.target as Element).closest('.booth-rect')) return

  if (drawMode.value && authStore.isEditing) {
    e.preventDefault()
    const c = getImageCoords(e)
    drawStart.value = c
    liveDraw.value = { x: c.x, y: c.y, w: 0, h: 0 }
    pendingDraw.value = null
    return
  }

  isPanning.value = true
  lastMouse.value = { x: e.clientX, y: e.clientY }
}

function onMouseMove(e: MouseEvent) {
  if (drawMode.value && drawStart.value) {
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
  if (drawMode.value && drawStart.value && liveDraw.value) {
    if (liveDraw.value.w > 8 && liveDraw.value.h > 8) {
      pendingDraw.value = { ...liveDraw.value }
      Object.assign(manualForm, { name: '', boothNr: '', hallNr: '', website: '', notes: '' })
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
      <p class="font-medium">No hall plan set up yet</p>
      <p class="text-sm mt-1">Use <span class="text-purple-400">Set Up Hall Plan</span> to upload your floor plan images.</p>
    </div>

    <div v-else class="space-y-3">
      <!-- Search bar + view toggle -->
      <div class="flex items-center gap-2">
        <UInput
          v-model="searchQuery"
          placeholder="Search booth nr across all maps…"
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
          size="sm" variant="outline" color="gray"
          :icon="viewMode === 'map' ? 'i-heroicons-list-bullet' : 'i-heroicons-map'"
          @click="viewMode = viewMode === 'map' ? 'list' : 'map'"
        >
          {{ viewMode === 'map' ? 'List' : 'Map' }}
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
            Map {{ idx + 1 }}
            <span class="ml-1.5 opacity-60">{{ img.booths.length }} booths</span>
          </button>
        </div>

        <!-- Legend + controls -->
        <div class="flex items-center gap-3 text-xs text-gray-400 flex-wrap">
          <span class="flex items-center gap-1.5"><span class="w-3 h-3 rounded-sm bg-orange-500 inline-block" />Added</span>
          <span class="flex items-center gap-1.5"><span class="w-3 h-3 rounded-sm bg-violet-500 inline-block" />Planned</span>
          <span class="flex items-center gap-1.5"><span class="w-3 h-3 rounded-sm bg-yellow-500 inline-block" />Partial</span>
          <span class="flex items-center gap-1.5"><span class="w-3 h-3 rounded-sm bg-green-500 inline-block" />All bought</span>
          <span class="flex items-center gap-1.5">
            <span class="w-3 h-3 rounded-sm border border-gray-500 inline-block opacity-60" />
            Detected (click to add)
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
              {{ drawMode ? 'Drawing — drag to place' : 'Draw Booth' }}
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
          Drag a rectangle on the map to place a new booth. Pan is disabled while drawing.
          <UButton size="xs" variant="link" color="gray" class="ml-auto" @click="toggleDrawMode">Cancel</UButton>
        </div>

        <!-- Map viewport -->
        <div
          v-if="currentPlanImage"
          ref="mapContainerRef"
          class="relative bg-gray-950 rounded-xl overflow-hidden border border-gray-800 select-none"
          :style="{ cursor: drawMode ? 'crosshair' : isPanning ? 'grabbing' : 'grab', height: '580px' }"
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
              :src="currentPlanImage.path"
              class="block"
              :width="currentPlanImage.naturalWidth"
              :height="currentPlanImage.naturalHeight"
              draggable="false"
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
                :fill="isSearchMatch(b.boothNr) ? 'rgba(168,85,247,0.25)' : 'rgba(156,163,175,0.07)'"
                :stroke="isSearchMatch(b.boothNr) ? '#a855f8' : 'rgba(156,163,175,0.45)'"
                :stroke-width="isSearchMatch(b.boothNr) ? 2.5 : 1.5"
                class="booth-rect"
                style="pointer-events: all; cursor: pointer"
                @click.stop="!drawMode && emit('addDetectedBooth', b.boothNr)"
              >
                <title>{{ b.boothNr }} — click to add</title>
              </rect>

              <text
                v-for="b in currentPlanImage.booths.filter(b => !getUserBooth(b.boothNr) && isSearchMatch(b.boothNr))"
                :key="`det-lbl-${b.boothNr}`"
                :x="b.x + b.w / 2" :y="b.y + b.h / 2 + 4"
                text-anchor="middle" :font-size="Math.min(12, b.h * 0.45)"
                font-weight="bold" fill="#a855f8" font-family="ui-monospace, monospace"
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
                rx="3" fill="rgba(168,85,247,0.15)" stroke="#a855f7" stroke-width="2"
                stroke-dasharray="6 3" style="pointer-events: none"
              />

              <!-- Pending (committed) draw rect -->
              <rect
                v-if="pendingDraw"
                :x="pendingDraw.x" :y="pendingDraw.y" :width="pendingDraw.w" :height="pendingDraw.h"
                rx="3" fill="rgba(168,85,247,0.2)" stroke="#a855f7" stroke-width="2.5"
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
                New Booth
              </p>
              <UButton icon="i-heroicons-x-mark" variant="ghost" color="gray" size="xs" @click="cancelManualBooth" />
            </div>

            <UFormGroup label="Booth Name" required>
              <UInput v-model="manualForm.name" placeholder="e.g. Phinea" size="sm" autofocus />
            </UFormGroup>

            <div class="grid grid-cols-2 gap-2">
              <UFormGroup label="Booth Nr">
                <UInput v-model="manualForm.boothNr" placeholder="10L13" size="sm" />
              </UFormGroup>
              <UFormGroup label="Hall Nr">
                <UInput v-model="manualForm.hallNr" placeholder="10" size="sm" />
              </UFormGroup>
            </div>

            <UFormGroup label="Website">
              <UInput v-model="manualForm.website" placeholder="https://…" size="sm" />
            </UFormGroup>

            <UFormGroup label="Notes">
              <UInput v-model="manualForm.notes" placeholder="Optional notes…" size="sm" />
            </UFormGroup>

            <div class="flex gap-2 pt-1">
              <UButton color="purple" size="sm" :disabled="!manualForm.name.trim()" class="flex-1" @click="saveManualBooth">
                Add Booth
              </UButton>
              <UButton variant="ghost" color="gray" size="sm" @click="cancelManualBooth">Cancel</UButton>
            </div>
          </div>

          <div class="absolute bottom-2 right-2 text-xs text-gray-600 pointer-events-none select-none">
            Scroll to zoom · Drag to pan · Click colored = select · Click outline = add
          </div>
        </div>

        <!-- User booths not on this map -->
        <div v-if="unmappedUserBooths.length" class="bg-gray-900 rounded-lg p-3">
          <p class="text-xs text-gray-500 mb-2">Your booths not detected on this map page:</p>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="b in unmappedUserBooths" :key="b.id"
              class="px-2 py-1 rounded text-xs font-medium transition-colors"
              :class="selectedBoothId === b.id ? 'bg-orange-500 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'"
              @click="emit('selectBooth', b.id === selectedBoothId ? null : b.id)"
            >
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
