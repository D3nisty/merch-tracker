<script setup lang="ts">
import type { Location, Booth, HallLayoutData, DetectedBooth } from '~/stores/events'

const props = defineProps<{
  location: Location
  selectedBoothId: string | null
}>()

const emit = defineEmits<{
  selectBooth: [id: string | null]
  addDetectedBooth: [boothNr: string]
}>()

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

// User booths not found on the current map page
const unmappedUserBooths = computed<Booth[]>(() => {
  const allUserBooths = props.location.booths ?? []
  if (!currentPlanImage.value) return allUserBooths
  const detectedNrs = new Set(currentPlanImage.value.booths.map(b => b.boothNr.toUpperCase()))
  return allUserBooths.filter(b => !b.boothNr || !detectedNrs.has(b.boothNr.toUpperCase()))
})

// All detected booths across all map pages (deduplicated by boothNr)
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

function onMouseDown(e: MouseEvent) {
  if ((e.target as SVGElement | HTMLElement).closest('.booth-rect')) return
  isPanning.value = true
  lastMouse.value = { x: e.clientX, y: e.clientY }
}

function onMouseMove(e: MouseEvent) {
  if (!isPanning.value) return
  pan.value.x += e.clientX - lastMouse.value.x
  pan.value.y += e.clientY - lastMouse.value.y
  lastMouse.value = { x: e.clientX, y: e.clientY }
}

function onMouseUp() { isPanning.value = false }

function resetZoom() {
  zoom.value = 1
  pan.value = { x: 20, y: 20 }
}

function panToBooth(b: DetectedBooth) {
  const vw = mapContainerRef.value?.clientWidth ?? 900
  const vh = mapContainerRef.value?.clientHeight ?? 580
  const bCx = b.x + b.w / 2
  const bCy = b.y + b.h / 2
  pan.value = {
    x: vw / 2 - bCx * zoom.value,
    y: vh / 2 - bCy * zoom.value,
  }
}

// Find which image contains a booth nr and switch to it + pan
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

// ── Booth colors ───────────────────────────────────────────────────────
function boothColor(booth: Booth): string {
  const products = booth.products ?? []
  if (!products.length) return '#f97316'               // orange  — added, no products yet
  if (products.every(p => p.isPurchased)) return '#22c55e'  // green   — all done
  if (products.some(p => p.isPurchased)) return '#eab308'   // yellow  — partial
  return '#a855f8'                                      // violet  — planned wishlist
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
    <!-- No layout data yet -->
    <div v-if="!layoutData" class="bg-gray-900 rounded-xl p-10 text-center text-gray-500">
      <UIcon name="i-heroicons-map" class="w-12 h-12 mx-auto mb-3 text-gray-600" />
      <p class="font-medium">No hall plan set up yet</p>
      <p class="text-sm mt-1">Use <span class="text-purple-400">Set Up Hall Plan</span> to upload your floor plan images — booth positions will be detected automatically.</p>
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
          size="sm"
          variant="outline"
          color="gray"
          :icon="viewMode === 'map' ? 'i-heroicons-list-bullet' : 'i-heroicons-map'"
          @click="viewMode = viewMode === 'map' ? 'list' : 'map'"
        >
          {{ viewMode === 'map' ? 'List' : 'Map' }}
        </UButton>
      </div>

      <!-- ── MAP VIEW ─────────────────────────────────────────────────── -->
      <template v-if="viewMode === 'map'">
        <!-- Image page tabs -->
        <div v-if="planImages.length > 1" class="flex gap-2 flex-wrap">
          <button
            v-for="(img, idx) in planImages"
            :key="img.id"
            @click="currentImageIdx = idx"
            :class="[
              'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border',
              currentImageIdx === idx
                ? 'bg-purple-600 border-purple-500 text-white'
                : 'bg-gray-900 border-gray-700 text-gray-400 hover:border-gray-600 hover:text-white',
            ]"
          >
            Map {{ idx + 1 }}
            <span class="ml-1.5 opacity-60">{{ img.booths.length }} booths</span>
          </button>
        </div>

        <!-- Legend + zoom controls -->
        <div class="flex items-center gap-3 text-xs text-gray-400 flex-wrap">
          <span class="flex items-center gap-1.5"><span class="w-3 h-3 rounded-sm bg-orange-500 inline-block" />Added</span>
          <span class="flex items-center gap-1.5"><span class="w-3 h-3 rounded-sm bg-violet-500 inline-block" />Planned</span>
          <span class="flex items-center gap-1.5"><span class="w-3 h-3 rounded-sm bg-yellow-500 inline-block" />Partial</span>
          <span class="flex items-center gap-1.5"><span class="w-3 h-3 rounded-sm bg-green-500 inline-block" />All bought</span>
          <span class="flex items-center gap-1.5">
            <span class="w-3 h-3 rounded-sm border border-gray-500 inline-block opacity-60" />
            Detected (click to add)
          </span>
          <div class="ml-auto flex items-center gap-1.5">
            <UButton size="xs" variant="ghost" color="gray" icon="i-heroicons-magnifying-glass-minus"
              @click="zoom = Math.max(0.15, zoom - 0.15)" />
            <span class="w-12 text-center">{{ Math.round(zoom * 100) }}%</span>
            <UButton size="xs" variant="ghost" color="gray" icon="i-heroicons-magnifying-glass-plus"
              @click="zoom = Math.min(6, zoom + 0.15)" />
            <UButton size="xs" variant="ghost" color="gray" icon="i-heroicons-arrows-pointing-in" @click="resetZoom" />
          </div>
        </div>

        <!-- Interactive map viewport -->
        <div
          v-if="currentPlanImage"
          ref="mapContainerRef"
          class="relative bg-gray-950 rounded-xl overflow-hidden border border-gray-800 select-none"
          @wheel.prevent="onWheel"
          @mousedown="onMouseDown"
          @mousemove="onMouseMove"
          @mouseup="onMouseUp"
          @mouseleave="onMouseUp"
          :style="{ cursor: isPanning ? 'grabbing' : 'grab', height: '580px' }"
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
                :x="b.x" :y="b.y" :width="b.w" :height="b.h"
                rx="3"
                :fill="isSearchMatch(b.boothNr) ? 'rgba(168,85,247,0.25)' : 'rgba(156,163,175,0.07)'"
                :stroke="isSearchMatch(b.boothNr) ? '#a855f8' : 'rgba(156,163,175,0.45)'"
                :stroke-width="isSearchMatch(b.boothNr) ? 2.5 : 1.5"
                class="booth-rect"
                style="pointer-events: all; cursor: pointer"
                @click.stop="emit('addDetectedBooth', b.boothNr)"
              >
                <title>{{ b.boothNr }} — click to add</title>
              </rect>

              <!-- Search highlight label for untracked booths -->
              <text
                v-for="b in currentPlanImage.booths.filter(b => !getUserBooth(b.boothNr) && isSearchMatch(b.boothNr))"
                :key="`det-lbl-${b.boothNr}`"
                :x="b.x + b.w / 2"
                :y="b.y + b.h / 2 + 4"
                text-anchor="middle"
                :font-size="Math.min(12, b.h * 0.45)"
                font-weight="bold"
                fill="#a855f8"
                font-family="ui-monospace, monospace"
                style="pointer-events: none"
              >{{ b.boothNr }}</text>

              <!-- User's tracked booths -->
              <g
                v-for="b in currentPlanImage.booths.filter(b => getUserBooth(b.boothNr))"
                :key="`user-${b.boothNr}`"
                class="booth-rect"
                style="pointer-events: all; cursor: pointer"
                @click.stop="
                  emit('selectBooth',
                    getUserBooth(b.boothNr)!.id === selectedBoothId
                      ? null
                      : getUserBooth(b.boothNr)!.id
                  )
                "
              >
                <rect
                  :x="b.x" :y="b.y" :width="b.w" :height="b.h"
                  rx="3"
                  :fill="boothColor(getUserBooth(b.boothNr)!)"
                  :fill-opacity="boothFillOpacity(getUserBooth(b.boothNr)!)"
                  :stroke="boothBorderColor(getUserBooth(b.boothNr)!)"
                  :stroke-width="selectedBoothId === getUserBooth(b.boothNr)!.id ? 2.5 : 1.5"
                />
                <text
                  :x="b.x + b.w / 2"
                  :y="b.y + b.h / 2 + 4"
                  text-anchor="middle"
                  :font-size="Math.min(12, b.h * 0.45)"
                  font-weight="bold"
                  fill="white"
                  font-family="ui-monospace, monospace"
                  style="pointer-events: none"
                >{{ b.boothNr }}</text>
              </g>
            </svg>
          </div>

          <!-- Hint -->
          <div class="absolute bottom-2 right-2 text-xs text-gray-600 pointer-events-none select-none">
            Scroll to zoom · Drag to pan · Click colored = select · Click outline = add
          </div>
        </div>

        <!-- User booths not on this map page -->
        <div v-if="unmappedUserBooths.length" class="bg-gray-900 rounded-lg p-3">
          <p class="text-xs text-gray-500 mb-2">Your booths not detected on this map page:</p>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="b in unmappedUserBooths"
              :key="b.id"
              class="px-2 py-1 rounded text-xs font-medium transition-colors"
              :class="selectedBoothId === b.id ? 'bg-orange-500 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'"
              @click="emit('selectBooth', b.id === selectedBoothId ? null : b.id)"
            >
              {{ b.name }}{{ b.boothNr ? ` (${b.boothNr})` : '' }}
            </button>
          </div>
        </div>
      </template>

      <!-- ── LIST VIEW ────────────────────────────────────────────────── -->
      <template v-else>
        <div class="bg-gray-900 rounded-xl border border-gray-800 p-4">
          <div class="text-xs text-gray-500 mb-3">
            {{ filteredListBooths.length }} booth{{ filteredListBooths.length !== 1 ? 's' : '' }}
            across {{ planImages.length }} map page{{ planImages.length !== 1 ? 's' : '' }}
            — <span class="text-orange-400">colored = in your list</span> · <span class="text-gray-400">gray = detected, click to add</span>
          </div>

          <div v-if="filteredListBooths.length" class="flex flex-wrap gap-1.5 max-h-96 overflow-y-auto">
            <button
              v-for="b in filteredListBooths"
              :key="b.boothNr"
              class="px-2 py-1 rounded text-xs font-mono font-semibold transition-all border"
              :class="getUserBooth(b.boothNr)
                ? [
                  selectedBoothId === getUserBooth(b.boothNr)!.id
                    ? 'ring-2 ring-white scale-105'
                    : 'opacity-90 hover:opacity-100',
                  'text-white border-transparent'
                ]
                : 'bg-gray-800 text-gray-400 border-gray-700 hover:border-gray-500 hover:text-white'"
              :style="getUserBooth(b.boothNr)
                ? { backgroundColor: boothColor(getUserBooth(b.boothNr)!) }
                : {}"
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
