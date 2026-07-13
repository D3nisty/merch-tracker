<script setup lang="ts">
import { useLocale } from '~/composables/useLocale'
import { useEventsStore } from '~/stores/events'

const props = defineProps<{ modelValue: boolean; initialQuery?: string; initialTab?: 'all' | 'files' }>()
const emit = defineEmits<{ 'update:modelValue': [v: boolean] }>()

const { t } = useLocale()
const eventsStore = useEventsStore()
const route = useRoute()

// Scope toggle: when opened from inside a trip/convention page, offer to limit
// results + files to just that event. Only surfaces on event detail routes so a
// stale currentEvent doesn't wrongly scope the palette elsewhere.
const onEventPage = computed(() => /^\/events\/[^/]+/.test(route.path) && !route.path.startsWith('/events/create'))
const scopeEvent = computed(() => (onEventPage.value ? eventsStore.currentEvent : null))
const scope = ref<'event' | 'all'>('all')

interface SearchResults {
  events: any[]; locations: any[]; booths: any[]; products: any[]; itinerary: any[]; files: any[]
}
const empty: SearchResults = { events: [], locations: [], booths: [], products: [], itinerary: [], files: [] }

const q = ref('')
const tab = ref<'all' | 'files'>('all')
const loading = ref(false)
const results = ref<SearchResults>({ ...empty })
const inputEl = ref<HTMLInputElement | null>(null)
let timer: any = null

const hasQ = computed(() => q.value.trim().length > 0)
const totalAll = computed(() => {
  const r = results.value
  return r.events.length + r.locations.length + r.booths.length + r.products.length + r.itinerary.length + r.files.length
})

async function run() {
  loading.value = true
  try {
    const params: Record<string, string> = { q: q.value.trim() }
    if (scope.value === 'event' && scopeEvent.value) params.eventId = scopeEvent.value.id
    results.value = await $fetch<SearchResults>('/api/search', { params })
  } catch {
    results.value = { ...empty }
  } finally {
    loading.value = false
  }
}
function schedule() {
  if (timer) clearTimeout(timer)
  timer = setTimeout(run, 220)
}
watch(q, schedule)
watch(scope, run)

watch(() => props.modelValue, async (open) => {
  if (!open) return
  q.value = props.initialQuery ?? ''
  tab.value = props.initialTab ?? 'all'
  // Default to scoping to the current trip when opened from within one.
  scope.value = scopeEvent.value ? 'event' : 'all'
  results.value = { ...empty }
  await nextTick()
  inputEl.value?.focus()
  run() // populate the file explorer even with an empty query
})

function close() { emit('update:modelValue', false) }
function go(path: string) { close(); navigateTo(path) }

// ── files explorer ──────────────────────────────────────────────────────
const isImage = (p: string) => /\.(png|jpe?g|gif|webp|heic|avif|bmp|svg)$/i.test(p)
const FILE_META: Record<string, { icon: string; color: string }> = {
  ticket: { icon: 'i-heroicons-ticket', color: 'text-planned' },
  catalog: { icon: 'i-heroicons-photo', color: 'text-sky' },
  article: { icon: 'i-heroicons-photo', color: 'text-sky' },
  receipt: { icon: 'i-heroicons-receipt-percent', color: 'text-bought' },
  floorplan: { icon: 'i-heroicons-map', color: 'text-conv-soft' },
  icon: { icon: 'i-heroicons-building-storefront', color: 'text-muted' },
}
function fileMeta(ft: string) { return FILE_META[ft] ?? { icon: 'i-heroicons-document', color: 'text-muted' } }
function ftLabel(ft: string) { return t(`search.ft.${ft}` as any) }

const filesByEvent = computed(() => {
  const map = new Map<string, { eventName: string; eventSlug: string; eventType: string; files: any[] }>()
  for (const f of results.value.files) {
    const key = f.eventSlug || f.eventName || '—'
    if (!map.has(key)) map.set(key, { eventName: f.eventName, eventSlug: f.eventSlug, eventType: f.eventType, files: [] })
    map.get(key)!.files.push(f)
  }
  return [...map.values()]
})

// Files shown inline in the "All" tab (a short preview)
const filePreview = computed(() => results.value.files.slice(0, 6))

const KIND_ICON: Record<string, string> = {
  activity: 'i-heroicons-map-pin', ticket: 'i-heroicons-ticket', food: 'i-heroicons-cake',
  transport: 'i-heroicons-arrow-right-circle', shopping: 'i-heroicons-shopping-bag', note: 'i-heroicons-pencil',
}
</script>

<template>
  <UModal :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)" :ui="{ width: 'w-full sm:max-w-2xl' }">
    <UCard :ui="{ body: { padding: 'p-0 sm:p-0' } }">
      <!-- search bar -->
      <div class="flex items-center gap-2.5 px-4 py-3 border-b border-line-soft">
        <UIcon name="i-heroicons-magnifying-glass" class="w-4.5 h-4.5 text-faint shrink-0" />
        <input
          ref="inputEl"
          v-model="q"
          type="text"
          :placeholder="t('search.placeholder')"
          class="flex-1 min-w-0 bg-transparent text-[14px] text-ink placeholder:text-faint outline-none border-0 p-0 focus:ring-0"
          @keydown.esc="close"
        />
        <UIcon v-if="loading" name="i-heroicons-arrow-path" class="w-4 h-4 text-faint animate-spin shrink-0" />
        <button type="button" class="text-faint hover:text-ink shrink-0" @click="close"><UIcon name="i-heroicons-x-mark" class="w-4.5 h-4.5" /></button>
      </div>

      <!-- tabs + scope -->
      <div class="flex items-center gap-1 px-4 pt-3 flex-wrap">
        <button
          v-for="tb in (['all','files'] as const)" :key="tb" type="button"
          class="px-3 py-1.5 rounded-field text-[12.5px] flex items-center gap-1.5 transition-colors"
          :class="tab === tb ? 'bg-sky text-on-accent font-bold' : 'text-muted hover:text-ink font-medium'"
          @click="tab = tb"
        >
          <UIcon :name="tb === 'all' ? 'i-heroicons-squares-2x2' : 'i-heroicons-folder'" class="w-3.5 h-3.5" />
          {{ tb === 'all' ? t('search.tabAll') : t('search.tabFiles') }}
          <span v-if="tb === 'files' && results.files.length" class="text-[10px] opacity-80">{{ results.files.length }}</span>
        </button>

        <!-- scope: this trip ↔ everywhere (only inside a trip/con) -->
        <div v-if="scopeEvent" class="ml-auto flex items-center gap-1 p-0.5 rounded-field border border-line bg-surface-2">
          <button
            type="button"
            class="px-2.5 py-1 rounded-[7px] text-[11.5px] flex items-center gap-1 transition-colors max-w-[160px]"
            :class="scope === 'event' ? 'bg-sky text-on-accent font-bold' : 'text-muted hover:text-ink'"
            :title="scopeEvent.name"
            @click="scope = 'event'"
          >
            <UIcon name="i-heroicons-map-pin" class="w-3 h-3 shrink-0" /> <span class="truncate">{{ t('search.scopeThis') }}</span>
          </button>
          <button
            type="button"
            class="px-2.5 py-1 rounded-[7px] text-[11.5px] flex items-center gap-1 transition-colors"
            :class="scope === 'all' ? 'bg-sky text-on-accent font-bold' : 'text-muted hover:text-ink'"
            @click="scope = 'all'"
          >
            <UIcon name="i-heroicons-globe-alt" class="w-3 h-3 shrink-0" /> {{ t('search.scopeAll') }}
          </button>
        </div>
      </div>

      <div class="max-h-[62vh] overflow-y-auto px-4 py-3 space-y-4">
        <!-- ══ ALL ══ -->
        <template v-if="tab === 'all'">
          <div v-if="!hasQ" class="text-center py-12 text-faint">
            <UIcon name="i-heroicons-magnifying-glass" class="w-10 h-10 mx-auto mb-2.5 text-faint-2" />
            <p class="text-sm">{{ t('search.typeToSearch') }}</p>
          </div>
          <div v-else-if="!loading && totalAll === 0" class="text-center py-12 text-faint">
            <p class="text-sm">{{ t('search.noResults') }}</p>
          </div>
          <template v-else>
            <!-- Events -->
            <div v-if="results.events.length">
              <div class="text-[11px] font-bold uppercase tracking-[0.08em] text-faint mb-1.5">{{ t('search.groupEvents') }}</div>
              <button v-for="e in results.events" :key="e.id" type="button" class="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-field hover:bg-surface-2 text-left" @click="go(`/events/${e.slug ?? e.id}`)">
                <UIcon :name="e.type === 'convention' ? 'i-heroicons-building-storefront' : 'i-heroicons-globe-europe-africa'" class="w-4 h-4 shrink-0" :class="e.type === 'convention' ? 'text-conv-soft' : 'text-sky'" />
                <span class="text-[13.5px] text-ink truncate">{{ e.name }}</span>
                <span v-if="e.location" class="text-[11.5px] text-faint truncate">· {{ e.location }}</span>
              </button>
            </div>
            <!-- Cities -->
            <div v-if="results.locations.length">
              <div class="text-[11px] font-bold uppercase tracking-[0.08em] text-faint mb-1.5">{{ t('search.groupCities') }}</div>
              <button v-for="l in results.locations" :key="l.id" type="button" class="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-field hover:bg-surface-2 text-left" @click="go(`/events/${l.eventSlug ?? l.eventId}`)">
                <UIcon name="i-heroicons-map-pin" class="w-4 h-4 text-sky shrink-0" />
                <span class="text-[13.5px] text-ink truncate">{{ l.name }}</span>
                <span class="text-[11.5px] text-faint truncate ml-auto">{{ l.eventName }}</span>
              </button>
            </div>
            <!-- Shops / booths -->
            <div v-if="results.booths.length">
              <div class="text-[11px] font-bold uppercase tracking-[0.08em] text-faint mb-1.5">{{ t('search.groupBooths') }}</div>
              <button v-for="b in results.booths" :key="b.id" type="button" class="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-field hover:bg-surface-2 text-left" @click="go(`/events/${b.eventSlug}/booth/${b.slug ?? b.id}`)">
                <UIcon name="i-heroicons-building-storefront" class="w-4 h-4 text-muted shrink-0" />
                <span class="text-[13.5px] text-ink truncate">{{ b.name }}</span>
                <span v-if="b.locationName" class="text-[11.5px] text-faint truncate ml-auto">{{ b.locationName }} · {{ b.eventName }}</span>
              </button>
            </div>
            <!-- Products -->
            <div v-if="results.products.length">
              <div class="text-[11px] font-bold uppercase tracking-[0.08em] text-faint mb-1.5">{{ t('search.groupProducts') }}</div>
              <button v-for="p in results.products" :key="p.id" type="button" class="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-field hover:bg-surface-2 text-left" @click="go(`/events/${p.eventSlug}/booth/${p.boothSlug ?? ''}`)">
                <UIcon name="i-heroicons-tag" class="w-4 h-4 text-muted shrink-0" />
                <span class="text-[13.5px] text-ink truncate">{{ p.name }}</span>
                <span v-if="p.price != null" class="mono text-[11.5px] text-planned shrink-0 ml-auto">{{ p.price.toFixed(0) }} {{ p.currency }}</span>
                <span class="text-[11.5px] text-faint truncate">{{ p.boothName }}</span>
              </button>
            </div>
            <!-- Schedule / itinerary -->
            <div v-if="results.itinerary.length">
              <div class="text-[11px] font-bold uppercase tracking-[0.08em] text-faint mb-1.5">{{ t('search.groupSchedule') }}</div>
              <button v-for="i in results.itinerary" :key="i.id" type="button" class="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-field hover:bg-surface-2 text-left" @click="go(`/events/${i.eventSlug}`)">
                <UIcon :name="KIND_ICON[i.kind] ?? 'i-heroicons-calendar-days'" class="w-4 h-4 text-sky-soft shrink-0" />
                <span class="text-[13.5px] text-ink truncate">{{ i.title }}</span>
                <span v-if="i.kind === 'transport' && (i.fromLoc || i.toLoc)" class="text-[11.5px] text-conv-soft truncate">{{ i.fromLoc || '?' }} → {{ i.toLoc || '?' }}</span>
                <span class="text-[11.5px] text-faint truncate ml-auto">{{ i.locationName }} · {{ i.eventName }}</span>
              </button>
            </div>
            <!-- Files preview -->
            <div v-if="results.files.length">
              <div class="flex items-center justify-between mb-1.5">
                <div class="text-[11px] font-bold uppercase tracking-[0.08em] text-faint">{{ t('search.groupFiles') }}</div>
                <button type="button" class="text-[11px] text-sky-soft hover:text-sky" @click="tab = 'files'">{{ t('search.seeAllFiles', { n: results.files.length }) }}</button>
              </div>
              <div class="flex items-center gap-2 flex-wrap">
                <a v-for="f in filePreview" :key="f.id" :href="f.url" target="_blank" class="group/f relative" :title="f.name">
                  <img v-if="isImage(f.url)" :src="f.url" alt="" class="h-14 w-14 rounded-md border border-line object-cover" />
                  <span v-else class="h-14 w-14 rounded-md border border-line bg-surface-2 flex flex-col items-center justify-center gap-1 text-[9px] text-muted px-1 text-center">
                    <UIcon :name="fileMeta(f.fileType).icon" class="w-4 h-4" :class="fileMeta(f.fileType).color" />
                    <span class="truncate w-full">{{ f.name }}</span>
                  </span>
                </a>
              </div>
            </div>
          </template>
        </template>

        <!-- ══ FILES EXPLORER ══ -->
        <template v-else>
          <div v-if="!loading && !results.files.length" class="text-center py-12 text-faint">
            <UIcon name="i-heroicons-folder-open" class="w-10 h-10 mx-auto mb-2.5 text-faint-2" />
            <p class="text-sm">{{ hasQ ? t('search.noResults') : t('search.filesEmpty') }}</p>
          </div>
          <div v-for="grp in filesByEvent" :key="grp.eventSlug || grp.eventName" class="space-y-2">
            <div class="flex items-center gap-2 text-[12px] font-bold text-ink-strong">
              <UIcon :name="grp.eventType === 'convention' ? 'i-heroicons-building-storefront' : 'i-heroicons-globe-europe-africa'" class="w-3.5 h-3.5" :class="grp.eventType === 'convention' ? 'text-conv-soft' : 'text-sky'" />
              {{ grp.eventName }}
              <span class="text-[10px] font-normal text-faint">{{ grp.files.length }}</span>
            </div>
            <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <div v-for="f in grp.files" :key="f.id" class="rounded-card border border-line bg-surface p-2 flex flex-col gap-1.5">
                <a :href="f.url" target="_blank" class="block" :title="f.name">
                  <img v-if="isImage(f.url)" :src="f.url" alt="" class="w-full h-24 rounded-md border border-line object-cover" />
                  <div v-else class="w-full h-24 rounded-md border border-line bg-surface-2 flex items-center justify-center">
                    <UIcon :name="fileMeta(f.fileType).icon" class="w-7 h-7" :class="fileMeta(f.fileType).color" />
                  </div>
                </a>
                <div class="min-w-0">
                  <div class="flex items-center gap-1">
                    <UIcon :name="fileMeta(f.fileType).icon" class="w-3 h-3 shrink-0" :class="fileMeta(f.fileType).color" />
                    <span class="text-[11.5px] text-ink truncate">{{ f.name }}</span>
                  </div>
                  <div class="text-[10px] text-faint truncate">{{ ftLabel(f.fileType) }}<template v-if="f.context"> · {{ f.context }}</template></div>
                </div>
                <div class="flex items-center gap-1.5">
                  <a :href="f.url" target="_blank" class="flex-1 text-center text-[10.5px] text-sky-soft hover:text-sky border border-line rounded-field py-1">{{ t('search.openFile') }}</a>
                  <button type="button" class="text-[10.5px] text-muted hover:text-ink border border-line rounded-field py-1 px-2" :title="t('search.locate')" @click="go(f.openTo)"><UIcon name="i-heroicons-arrow-top-right-on-square" class="w-3.5 h-3.5" /></button>
                </div>
              </div>
            </div>
          </div>
        </template>
      </div>
    </UCard>
  </UModal>
</template>
