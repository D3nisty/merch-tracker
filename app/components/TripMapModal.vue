<script setup lang="ts">
import 'leaflet/dist/leaflet.css'
import type { Event } from '~/stores/events'
import { useEventsStore } from '~/stores/events'
import { useLocale } from '~/composables/useLocale'

const props = defineProps<{ modelValue: boolean; event: Event; canEdit: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [v: boolean] }>()

const store = useEventsStore()
const { t } = useLocale()

const mapEl = ref<HTMLElement | null>(null)
const locating = ref(false)
// Leaflet is browser-only + heavy → dynamically imported on first open.
let L: any = null
let map: any = null
let layers: any[] = []

// Cities (skip convention halls). Order = trip order (sortOrder from the API).
const cities = computed(() => (props.event.locations ?? []).filter(l => l.type !== 'hall'))

async function ensureMap() {
  if (!L) { const mod: any = await import('leaflet'); L = mod.default ?? mod }
  if (!map && mapEl.value) {
    map = L.map(mapEl.value, { zoomControl: true }).setView([20, 0], 2)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '© OpenStreetMap contributors © CARTO',
      subdomains: 'abcd', maxZoom: 19,
    }).addTo(map)
  }
}

function render() {
  if (!map || !L) return
  for (const ly of layers) map.removeLayer(ly)
  layers = []
  const pts: [number, number][] = []
  cities.value.forEach((c, i) => {
    if (c.latitude == null || c.longitude == null) return
    const ll: [number, number] = [c.latitude, c.longitude]
    pts.push(ll)
    const icon = L.divIcon({ className: '', html: `<div class="trip-pin">${i + 1}</div>`, iconSize: [26, 26], iconAnchor: [13, 13] })
    const dates = c.dateFrom ? new Date(c.dateFrom).toLocaleDateString() : ''
    layers.push(L.marker(ll, { icon }).addTo(map).bindPopup(`<b>${c.name}</b>${dates ? `<br>${dates}` : ''}`))
  })
  if (pts.length > 1) layers.push(L.polyline(pts, { color: '#38bdf8', weight: 3, opacity: 0.85 }).addTo(map))
  if (pts.length === 1) map.setView(pts[0], 8)
  else if (pts.length > 1) map.fitBounds(L.latLngBounds(pts).pad(0.2), { maxZoom: 9 })
}

// Geocode any city missing coords, one at a time (Nominatim asks for ≤1/sec),
// re-rendering as each resolves so pins pop in progressively.
async function geocodeMissing() {
  if (!props.canEdit) return
  const missing = cities.value.filter(c => c.latitude == null || c.longitude == null)
  if (!missing.length) return
  locating.value = true
  for (const c of missing) {
    try { await store.geocodeLocation(c.id); render() } catch { /* leave unpinned */ }
    await new Promise(r => setTimeout(r, 1100))
  }
  locating.value = false
}

watch(() => props.modelValue, async (open) => {
  if (!open) return
  await nextTick()
  await ensureMap()
  setTimeout(() => { map?.invalidateSize(); render(); geocodeMissing() }, 80)
})
onBeforeUnmount(() => { if (map) { map.remove(); map = null } })
</script>

<template>
  <UModal :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)" :ui="{ width: 'w-full sm:max-w-3xl' }">
    <UCard>
      <template #header>
        <div class="flex items-center justify-between gap-3">
          <h3 class="font-bold text-ink-strong text-base flex items-center gap-2">
            <UIcon name="i-heroicons-map" class="w-4 h-4 text-sky" /> {{ t('map.title') }}
          </h3>
          <div class="flex items-center gap-3">
            <span v-if="locating" class="text-[11px] text-faint flex items-center gap-1"><UIcon name="i-heroicons-arrow-path" class="w-3.5 h-3.5 animate-spin" /> {{ t('map.locating') }}</span>
            <button type="button" class="text-faint hover:text-ink" @click="emit('update:modelValue', false)"><UIcon name="i-heroicons-x-mark" class="w-4.5 h-4.5" /></button>
          </div>
        </div>
      </template>
      <div ref="mapEl" class="w-full h-[60vh] rounded-card overflow-hidden border border-line bg-surface-2" />
      <p class="text-[11px] text-faint mt-2">{{ t('map.hint') }}</p>
    </UCard>
  </UModal>
</template>
