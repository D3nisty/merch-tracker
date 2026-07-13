<script setup lang="ts">
import type { Event, ItineraryItem, ItineraryKind } from '~/stores/events'
import { useEventsStore } from '~/stores/events'
import { useAuthStore } from '~/stores/auth'
import { useLocale } from '~/composables/useLocale'

const props = defineProps<{ event: Event }>()
const store = useEventsStore()
const authStore = useAuthStore()
const { t } = useLocale()
const canEdit = computed(() => authStore.isEditing)

const HOUR_H = 48        // px per hour
const DEFAULT_DUR = 60   // minutes for items without an end time
const COL_W = 172        // px per day column

// Opaque blocks (so hour gridlines never show through the text) + a coloured
// left accent bar per kind.
const KIND_META: Record<string, { icon: string; text: string; accent: string }> = {
  activity: { icon: 'i-heroicons-map-pin', text: 'text-sky', accent: 'bg-sky' },
  ticket: { icon: 'i-heroicons-ticket', text: 'text-planned', accent: 'bg-planned' },
  food: { icon: 'i-heroicons-cake', text: 'text-orange-400', accent: 'bg-orange-400' },
  transport: { icon: 'i-heroicons-arrow-right-circle', text: 'text-conv-soft', accent: 'bg-conv' },
  shopping: { icon: 'i-heroicons-shopping-bag', text: 'text-bought', accent: 'bg-bought' },
  note: { icon: 'i-heroicons-pencil', text: 'text-muted', accent: 'bg-slate-500' },
}
function meta(k: ItineraryKind) { return KIND_META[k] ?? KIND_META.activity }

interface CalItem extends ItineraryItem { _city: string }
const allItems = computed<CalItem[]>(() => {
  const out: CalItem[] = []
  for (const loc of props.event.locations ?? []) {
    if (loc.type === 'hall') continue
    for (const it of loc.itinerary ?? []) out.push({ ...it, _city: loc.name })
  }
  return out
})
const hasAny = computed(() => allItems.value.length > 0)

const todayISO = ref('')
function isoOf(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
onMounted(() => {
  todayISO.value = isoOf(new Date())
  // Land on today if it's in view, else the first day with entries.
  nextTick(() => {
    const target = dayList.value.includes(todayISO.value)
      ? todayISO.value
      : (allItems.value.filter(i => i.date).map(i => i.date as string).sort()[0])
    if (target) jumpTo(target)
  })
})

// Effective day range: the trip's own dates, unless the plan sits entirely
// outside them (stale dates) — then span the planned days so blocks show.
const dayList = computed<string[]>(() => {
  const dates = [...new Set(allItems.value.filter(i => i.date).map(i => i.date as string))].sort()
  let startISO: string | undefined, endISO: string | undefined
  if (props.event.date) {
    const ts = props.event.date, te = props.event.dateTo || props.event.date
    const anyInside = dates.some(d => d >= ts && d <= te)
    if (anyInside || !dates.length) { startISO = ts; endISO = te } else { startISO = dates[0]; endISO = dates[dates.length - 1] }
  } else {
    if (!dates.length) return []
    startISO = dates[0]; endISO = dates[dates.length - 1]
  }
  const out: string[] = []
  const d = new Date(startISO + 'T00:00:00'); const end = new Date(endISO + 'T00:00:00')
  let guard = 0
  while (d <= end && guard < 400) { out.push(isoOf(d)); d.setDate(d.getDate() + 1); guard++ }
  return out
})

function toMin(t?: string | null) { if (!t) return null; const [h, m] = t.split(':').map(Number); return h * 60 + (m || 0) }

const bounds = computed(() => {
  let mn = Infinity, mx = -Infinity
  for (const it of allItems.value) {
    const s = toMin(it.time); if (s == null) continue
    const e = it.kind === 'transport' && it.endTime ? (toMin(it.endTime) ?? s + DEFAULT_DUR) : s + DEFAULT_DUR
    mn = Math.min(mn, s); mx = Math.max(mx, e)
  }
  if (!isFinite(mn)) return { start: 8, end: 20 }
  return { start: Math.max(0, Math.min(8, Math.floor(mn / 60))), end: Math.min(24, Math.max(20, Math.ceil(mx / 60))) }
})
const hours = computed(() => { const a: number[] = []; for (let h = bounds.value.start; h <= bounds.value.end; h++) a.push(h); return a })
const gridHeight = computed(() => (bounds.value.end - bounds.value.start) * HOUR_H)

// Timed blocks for a day with greedy lane layout for overlaps.
function dayTimed(iso: string) {
  const items = allItems.value
    .filter(i => i.date === iso && i.time)
    .map(i => {
      const s = toMin(i.time)!
      const rawE = i.kind === 'transport' && i.endTime ? (toMin(i.endTime) ?? s + DEFAULT_DUR) : s + DEFAULT_DUR
      return { item: i, s, e: Math.max(rawE, s + 20) }
    })
    .sort((a, b) => a.s - b.s || a.e - b.e)
  const laneEnds: number[] = []
  const placed = items.map((b) => {
    let lane = laneEnds.findIndex(end => end <= b.s)
    if (lane === -1) { lane = laneEnds.length; laneEnds.push(b.e) } else laneEnds[lane] = b.e
    return { ...b, lane }
  })
  const laneCount = Math.max(1, laneEnds.length)
  return placed.map(b => ({
    item: b.item,
    top: (b.s - bounds.value.start * 60) / 60 * HOUR_H,
    height: Math.max(24, (b.e - b.s) / 60 * HOUR_H - 2),
    leftPct: (b.lane / laneCount) * 100,
    widthPct: 100 / laneCount,
  }))
}
function dayUntimed(iso: string) { return allItems.value.filter(i => i.date === iso && !i.time) }
const hasAnyUntimed = computed(() => allItems.value.some(i => i.date && !i.time))

function fmtWeekday(iso: string) { return new Date(iso + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short' }) }
function fmtDayNum(iso: string) { return new Date(iso + 'T00:00:00').getDate() }
function fmtMonth(iso: string) { return new Date(iso + 'T00:00:00').toLocaleDateString(undefined, { month: 'short' }) }
function dayHasEntries(iso: string) { return allItems.value.some(i => i.date === iso) }

// ── quick nav ────────────────────────────────────────────────────────────
const scroller = ref<HTMLElement | null>(null)
function jumpTo(iso: string) {
  const col = document.getElementById('calcol-' + iso)
  const sc = scroller.value
  if (!col || !sc) return
  sc.scrollTo({ left: col.getBoundingClientRect().left - sc.getBoundingClientRect().left + sc.scrollLeft - 48, behavior: 'smooth' })
}

// ── add / edit ─────────────────────────────────────────────────────────
const showItem = ref(false)
const editItem = ref<ItineraryItem | null>(null)
const addDate = ref<string | null>(null)
function openEdit(it: ItineraryItem) { if (!canEdit.value) return; editItem.value = it; addDate.value = null; showItem.value = true }
function openAdd(date?: string | null) { editItem.value = null; addDate.value = date ?? null; showItem.value = true }
const hasCity = computed(() => (props.event.locations ?? []).some(l => l.type !== 'hall'))
</script>

<template>
  <div>
    <div v-if="!hasAny" class="text-center py-16 text-faint">
      <UIcon name="i-heroicons-calendar-days" class="w-12 h-12 mx-auto mb-3 text-faint-2" />
      <p>{{ t('calendar.empty') }}</p>
      <button v-if="canEdit && hasCity" type="button" class="mt-4 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-field grad-primary text-[12.5px] font-bold" @click="openAdd(null)">
        <UIcon name="i-heroicons-plus" class="w-3.5 h-3.5" /> {{ t('timetable.add') }}
      </button>
    </div>

    <template v-else>
      <!-- quick nav: day chips -->
      <div class="flex items-center gap-2 mb-3">
        <div class="flex items-center gap-1.5 overflow-x-auto flex-1 pb-1">
          <button
            v-for="iso in dayList" :key="iso" type="button"
            class="shrink-0 flex flex-col items-center px-2.5 py-1 rounded-field border transition-colors"
            :class="[
              iso === todayISO ? 'border-sky bg-chip-sky text-sky-soft' : 'border-line text-muted hover:text-ink hover:border-line-focus',
            ]"
            @click="jumpTo(iso)"
          >
            <span class="text-[9px] uppercase tracking-wide">{{ fmtWeekday(iso) }}</span>
            <span class="text-[13px] font-bold leading-none">{{ fmtDayNum(iso) }}</span>
            <span class="w-1 h-1 rounded-full mt-0.5" :class="dayHasEntries(iso) ? 'bg-sky shadow-[0_0_5px_rgba(56,189,248,0.9)]' : 'bg-transparent'" />
          </button>
        </div>
        <button
          v-if="canEdit && hasCity"
          type="button"
          class="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-field grad-primary text-[12.5px] font-bold"
          @click="openAdd(null)"
        >
          <UIcon name="i-heroicons-plus" class="w-3.5 h-3.5" /> {{ t('timetable.add') }}
        </button>
      </div>

      <!-- calendar grid -->
      <div class="rounded-card border border-line bg-surface overflow-hidden">
        <div ref="scroller" class="overflow-x-auto">
          <div class="min-w-max">
            <!-- day headers -->
            <div class="flex border-b border-line-hair">
              <div class="w-12 shrink-0 border-r border-line-hair" />
              <div
                v-for="iso in dayList" :key="iso"
                class="shrink-0 border-r border-line-hair px-2 py-1.5 text-center"
                :style="{ width: COL_W + 'px' }"
                :class="iso === todayISO ? 'bg-chip-sky/40' : ''"
              >
                <div class="text-[10px] uppercase tracking-wide text-faint">{{ fmtWeekday(iso) }}</div>
                <div class="text-[13px] font-bold" :class="iso === todayISO ? 'text-sky-soft' : 'text-ink-strong'">{{ fmtDayNum(iso) }} {{ fmtMonth(iso) }}</div>
              </div>
            </div>

            <!-- all-day band -->
            <div v-if="hasAnyUntimed" class="flex border-b border-line-hair">
              <div class="w-12 shrink-0 border-r border-line-hair flex items-center justify-end pr-1 py-1 text-[9px] text-faint uppercase">{{ t('calendar.allDay') }}</div>
              <div
                v-for="iso in dayList" :key="iso"
                class="shrink-0 border-r border-line-hair p-1 space-y-1 min-h-[28px]"
                :style="{ width: COL_W + 'px' }"
              >
                <button
                  v-for="it in dayUntimed(iso)" :key="it.id" type="button"
                  class="relative w-full flex items-center gap-1 pl-2 pr-1.5 py-0.5 rounded border border-line bg-surface-2 overflow-hidden text-left"
                  :class="canEdit ? 'hover:border-line-focus' : ''"
                  @click="openEdit(it)"
                >
                  <span class="absolute left-0 inset-y-0 w-1" :class="meta(it.kind).accent" />
                  <UIcon :name="meta(it.kind).icon" class="w-3 h-3 shrink-0" :class="meta(it.kind).text" />
                  <span class="text-[10.5px] text-ink truncate">{{ it.title }}</span>
                </button>
              </div>
            </div>

            <!-- time grid -->
            <div class="flex">
              <!-- hour axis -->
              <div class="w-12 shrink-0 relative border-r border-line-hair" :style="{ height: gridHeight + 'px' }">
                <div v-for="h in hours" :key="h" class="absolute right-1 -translate-y-1/2 text-[10px] mono text-faint" :style="{ top: (h - bounds.start) * HOUR_H + 'px' }">{{ h }}:00</div>
              </div>
              <!-- day columns -->
              <div
                v-for="iso in dayList" :key="iso" :id="'calcol-' + iso"
                class="shrink-0 relative border-r border-line-hair"
                :style="{ width: COL_W + 'px', height: gridHeight + 'px' }"
                :class="iso === todayISO ? 'bg-chip-sky/10' : ''"
              >
                <!-- hour lines -->
                <div v-for="h in hours" :key="h" class="absolute inset-x-0 border-t border-line-hair/60" :style="{ top: (h - bounds.start) * HOUR_H + 'px' }" />
                <!-- empty-day click target to add on that day -->
                <button v-if="canEdit && hasCity" type="button" class="absolute inset-0 w-full h-full" :title="t('timetable.addOnDay')" @click="openAdd(iso)" />
                <!-- timed blocks -->
                <button
                  v-for="b in dayTimed(iso)" :key="b.item.id"
                  type="button"
                  class="absolute z-10 rounded-md border border-line bg-surface-2 pl-2 pr-1.5 py-0.5 text-left overflow-hidden transition shadow-sm"
                  :class="canEdit ? 'cursor-pointer hover:border-line-focus hover:z-20' : ''"
                  :style="{ top: b.top + 'px', height: b.height + 'px', left: `calc(${b.leftPct}% + 1px)`, width: `calc(${b.widthPct}% - 3px)` }"
                  @click.stop="openEdit(b.item)"
                >
                  <span class="absolute left-0 inset-y-0 w-1" :class="meta(b.item.kind).accent" />
                  <div class="flex items-center gap-1">
                    <UIcon :name="meta(b.item.kind).icon" class="w-3 h-3 shrink-0" :class="meta(b.item.kind).text" />
                    <span class="text-[9.5px] mono text-faint truncate">{{ b.item.time }}<template v-if="b.item.kind === 'transport' && b.item.endTime">–{{ b.item.endTime }}</template></span>
                  </div>
                  <div class="text-[11px] text-ink-strong font-medium leading-tight" :class="b.height > 34 ? '' : 'truncate'">{{ b.item.title }}</div>
                  <div v-if="b.item.kind === 'transport' && (b.item.fromLoc || b.item.toLoc)" class="text-[9.5px] text-conv-soft truncate">{{ b.item.fromLoc || '?' }} → {{ b.item.toLoc || '?' }}</div>
                  <div v-else-if="b.height > 48" class="text-[9px] text-faint truncate">{{ b.item._city }}</div>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <ItineraryItemModal
      v-model="showItem"
      :event="event"
      :item="editItem"
      :default-date="addDate"
      :can-edit="canEdit"
    />
  </div>
</template>
