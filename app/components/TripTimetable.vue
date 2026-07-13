<script setup lang="ts">
import type { Event, ItineraryItem, ItineraryKind } from '~/stores/events'
import { useEventsStore } from '~/stores/events'
import { useAuthStore } from '~/stores/auth'
import { useLocale } from '~/composables/useLocale'
import { usePersonColor } from '~/composables/usePersonColor'

const props = defineProps<{ event: Event; focusToday?: boolean }>()
const store = useEventsStore()
const authStore = useAuthStore()
const { t } = useLocale()
const { personColorClass, initial } = usePersonColor()

const canEdit = computed(() => authStore.isEditing)
const hasCity = computed(() => (props.event.locations ?? []).some(l => l.type !== 'hall'))

// ── add / edit via the shared itinerary modal ───────────────────────────
const showItem = ref(false)
const editItem = ref<ItineraryItem | null>(null)
const addDate = ref<string | null>(null)

function findItem(id: string): ItineraryItem | null {
  for (const loc of props.event.locations ?? []) {
    const f = (loc.itinerary ?? []).find(i => i.id === id)
    if (f) return f
  }
  return null
}
function openEdit(e: Entry) {
  if (!canEdit.value || e._synthetic || !e.id) return
  editItem.value = findItem(e.id)
  addDate.value = null
  showItem.value = true
}
function openAdd(date?: string | null) {
  editItem.value = null
  addDate.value = date ?? null
  showItem.value = true
}

const KIND_META: Record<string, { icon: string; color: string }> = {
  activity: { icon: 'i-heroicons-map-pin', color: 'text-sky' },
  ticket: { icon: 'i-heroicons-ticket', color: 'text-planned' },
  food: { icon: 'i-heroicons-cake', color: 'text-orange-400' },
  transport: { icon: 'i-heroicons-arrow-right-circle', color: 'text-conv-soft' },
  shopping: { icon: 'i-heroicons-shopping-bag', color: 'text-bought' },
  note: { icon: 'i-heroicons-pencil', color: 'text-muted' },
  location: { icon: 'i-heroicons-flag', color: 'text-sky-soft' },
}

// One flat entry per itinerary item across every city, plus a synthetic
// "arrive in <city>" marker on each city's start date.
interface Entry extends Partial<ItineraryItem> { _city: string; _kind: ItineraryKind | 'location'; _synthetic?: boolean }
const entries = computed<Entry[]>(() => {
  const out: Entry[] = []
  for (const loc of props.event.locations ?? []) {
    if (loc.type === 'hall') continue
    if (loc.dateFrom) {
      out.push({ _city: loc.name, _kind: 'location', title: loc.name, date: loc.dateFrom, time: '', _synthetic: true })
    }
    for (const it of loc.itinerary ?? []) {
      out.push({ ...it, _city: loc.name, _kind: it.kind })
    }
  }
  return out
})

// Group by day (undated → a trailing "anytime" bucket), sorted; within a day by time.
const dayGroups = computed(() => {
  const map = new Map<string, Entry[]>()
  for (const e of entries.value) {
    const key = e.date || ''
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(e)
  }
  return [...map.entries()]
    .sort((a, b) => (a[0] === '' ? 1 : b[0] === '' ? -1 : a[0] < b[0] ? -1 : 1))
    .map(([date, list]) => ({
      date,
      items: list.sort((x, y) => {
        // location marker first, then by time, synthetic before timed ties
        if (x._synthetic && !y._synthetic) return -1
        if (y._synthetic && !x._synthetic) return 1
        return (x.time || '').localeCompare(y.time || '')
      }),
    }))
})

const hasAny = computed(() => entries.value.some(e => !e._synthetic))

// ── calendar jump-to-day ────────────────────────────────────────────────
const showCal = ref(true)
const flashDate = ref('')
// Today (local). Set on mount to avoid an SSR/client hydration mismatch.
const todayISO = ref('')
onMounted(() => {
  const d = new Date()
  todayISO.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
})
const entryDates = computed(() => new Set(dayGroups.value.map(g => g.date).filter(Boolean)))

// ── "Today" focus mode: today's plan + the next planned day ──────────────
const todayCities = computed(() => (props.event.locations ?? []).filter(l =>
  l.type !== 'hall' && l.dateFrom && todayISO.value >= l.dateFrom && todayISO.value <= (l.dateTo || l.dateFrom)))
const focusGroups = computed(() => {
  const tISO = todayISO.value
  if (!tISO) return []
  const today = dayGroups.value.find(g => g.date === tISO)
  const next = dayGroups.value.find(g => g.date && g.date > tISO)
  const out: any[] = [today ?? { date: tISO, items: [], emptyToday: true }]
  if (next) out.push({ ...next, isNext: true })
  return out
})
const renderGroups = computed(() => (props.focusToday ? focusGroups.value : dayGroups.value))
function fmtFullDay(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
}

const weekdayLabels = computed(() => {
  // 2024-01-01 is a Monday → Monday-first localized short names.
  return Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 1 + i).toLocaleDateString(undefined, { weekday: 'short' }))
})

function inTrip(iso: string) {
  const a = props.event.date
  if (!a) return false
  const b = props.event.dateTo || a
  return iso >= a && iso <= b
}
function buildMonth(y: number, m: number) {
  const first = new Date(y, m, 1)
  const label = first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
  const daysInMonth = new Date(y, m + 1, 0).getDate()
  const lead = (first.getDay() + 6) % 7 // Monday-first leading blanks
  const cells: ({ iso: string; d: number; has: boolean; inTrip: boolean; isToday: boolean } | null)[] = []
  for (let i = 0; i < lead; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    cells.push({ iso, d, has: entryDates.value.has(iso), inTrip: inTrip(iso), isToday: iso === todayISO.value })
  }
  return { label, cells }
}
const months = computed(() => {
  // Normally the months inside the trip's own date range (e.g. a 31 Jul–4 Sep
  // trip shows Jul/Aug/Sep). If the trip has no dates, OR the plan falls
  // entirely outside the trip window (stale dates), fall back to the span of
  // planned days so the glowing days stay jumpable.
  const dates = [...entryDates.value].sort()
  let startISO: string | undefined
  let endISO: string | undefined
  if (props.event.date) {
    const ts = props.event.date
    const te = props.event.dateTo || props.event.date
    const anyInside = dates.some(d => d >= ts && d <= te)
    if (anyInside || !dates.length) { startISO = ts; endISO = te }
    else { startISO = dates[0]; endISO = dates[dates.length - 1] }
  } else {
    if (!dates.length) return []
    startISO = dates[0]; endISO = dates[dates.length - 1]
  }
  const [sy, sm] = startISO.split('-').map(Number)
  const [ey, em] = endISO.split('-').map(Number)
  const out: { label: string; cells: any[] }[] = []
  let y = sy, m = sm - 1
  while ((y < ey || (y === ey && m <= em - 1)) && out.length < 24) {
    out.push(buildMonth(y, m))
    m++; if (m > 11) { m = 0; y++ }
  }
  return out
})
function scrollToDay(iso: string) {
  const el = document.getElementById('ttday-' + iso)
  if (!el) return
  el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  flashDate.value = iso
  setTimeout(() => { if (flashDate.value === iso) flashDate.value = '' }, 1600)
}

function fmtDay(d: string) {
  return new Date(d).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
}
const isImage = (p: string | null | undefined) => !!p && /\.(png|jpe?g|gif|webp|heic|avif)$/i.test(p)

async function toggleDone(e: Entry) {
  if (!canEdit.value || e._synthetic || !e.id) return
  await store.updateItineraryItem(e.id, { done: !e.done })
}
</script>

<template>
  <div>
    <!-- ══ TODAY banner (focus mode) ══ -->
    <div v-if="focusToday" class="mb-5 rounded-card border border-line bg-surface p-4 flex items-center justify-between gap-3 flex-wrap">
      <div class="min-w-0">
        <div class="text-[11px] font-bold uppercase tracking-[0.08em] text-sky-soft">{{ t('today.today') }}</div>
        <div class="text-[18px] font-bold text-ink-strong">{{ todayISO ? fmtFullDay(todayISO) : '—' }}</div>
        <div v-if="todayCities.length" class="flex items-center gap-1.5 mt-1 text-[12.5px] text-muted">
          <UIcon name="i-heroicons-map-pin" class="w-3.5 h-3.5 text-sky" />
          <span>{{ t('today.inCity') }} <b class="text-ink">{{ todayCities.map(c => c.name).join(', ') }}</b></span>
        </div>
      </div>
      <button
        v-if="canEdit && hasCity"
        type="button"
        class="flex items-center gap-1.5 px-3 py-1.5 rounded-field grad-primary text-[12.5px] font-bold shrink-0"
        @click="openAdd(todayISO || null)"
      >
        <UIcon name="i-heroicons-plus" class="w-3.5 h-3.5" /> {{ t('timetable.add') }}
      </button>
    </div>

    <!-- header: calendar jump + add entry (full timetable only) -->
    <div v-if="!focusToday" class="flex items-center justify-between gap-2 mb-3">
      <button
        v-if="months.length"
        type="button"
        class="flex items-center gap-1.5 px-3 py-1.5 rounded-field border border-line text-[12.5px] text-muted hover:text-ink transition-colors"
        @click="showCal = !showCal"
      >
        <UIcon name="i-heroicons-calendar-days" class="w-3.5 h-3.5" /> {{ t('timetable.jumpToDay') }}
        <UIcon :name="showCal ? 'i-heroicons-chevron-up' : 'i-heroicons-chevron-down'" class="w-3.5 h-3.5" />
      </button>
      <div v-else />
      <button
        v-if="canEdit && hasCity"
        type="button"
        class="flex items-center gap-1.5 px-3 py-1.5 rounded-field grad-primary text-[12.5px] font-bold"
        @click="openAdd(null)"
      >
        <UIcon name="i-heroicons-plus" class="w-3.5 h-3.5" /> {{ t('timetable.add') }}
      </button>
    </div>

    <!-- calendar navigator -->
    <div v-if="!focusToday && showCal && months.length" class="mb-5 rounded-card border border-line bg-surface p-3.5 flex gap-6 overflow-x-auto">
      <div v-for="mo in months" :key="mo.label" class="shrink-0">
        <div class="text-[12px] font-bold text-ink-strong mb-2">{{ mo.label }}</div>
        <div class="grid grid-cols-7 gap-1">
          <div v-for="(w, i) in weekdayLabels" :key="'w' + i" class="w-8 text-center text-[9px] text-faint uppercase">{{ w }}</div>
          <template v-for="(c, idx) in mo.cells" :key="idx">
            <div v-if="!c" class="w-8 h-8" />
            <button
              v-else
              type="button"
              :disabled="!c.has"
              class="w-8 h-8 rounded-md text-[11.5px] flex items-center justify-center transition-all"
              :class="[c.has ? 'bg-sky/25 text-sky font-bold shadow-[0_0_10px_-1px_rgba(56,189,248,0.75)] hover:bg-sky hover:text-on-accent hover:shadow-[0_0_16px_0_rgba(56,189,248,0.95)]' : (c.inTrip ? 'text-muted' : 'text-faint-2 cursor-default'), c.isToday ? 'ring-1 ring-sky' : '']"
              @click="c.has && scrollToDay(c.iso)"
            >{{ c.d }}</button>
          </template>
        </div>
      </div>
    </div>

    <div v-if="!focusToday && !hasAny" class="text-center py-16 text-faint">
      <UIcon name="i-heroicons-calendar-days" class="w-12 h-12 mx-auto mb-3 text-faint-2" />
      <p>{{ t('timetable.empty') }}</p>
      <p class="text-sm mt-1">{{ t('timetable.emptyHint') }}</p>
      <button v-if="canEdit && hasCity" type="button" class="mt-4 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-field grad-primary text-[12.5px] font-bold" @click="openAdd(null)">
        <UIcon name="i-heroicons-plus" class="w-3.5 h-3.5" /> {{ t('timetable.add') }}
      </button>
    </div>

    <div v-else class="relative space-y-6">
      <div
        v-for="grp in renderGroups"
        :key="grp.date || 'anytime'"
        :id="'ttday-' + (grp.date || 'anytime')"
        class="scroll-mt-24 rounded-card transition-[box-shadow] duration-500"
        :class="grp.date && flashDate === grp.date ? 'ring-2 ring-sky' : ''"
      >
        <div class="flex items-center gap-2 mb-2.5">
          <span v-if="grp.isNext" class="text-[10px] font-bold uppercase tracking-[0.06em] text-planned bg-chip-sky/40 px-1.5 py-0.5 rounded">{{ t('today.nextUp') }}</span>
          <h3 class="text-[13px] font-bold text-ink-strong">{{ grp.date ? fmtDay(grp.date) : t('planner.anytime') }}</h3>
          <div class="flex-1 h-px bg-line-soft" />
          <button v-if="canEdit && hasCity && grp.date" type="button" class="text-faint hover:text-sky shrink-0" :title="t('timetable.addOnDay')" @click="openAdd(grp.date)">
            <UIcon name="i-heroicons-plus-circle" class="w-4 h-4" />
          </button>
        </div>

        <!-- nothing planned today -->
        <div v-if="grp.emptyToday" class="rounded-card border border-dashed border-line bg-surface px-4 py-6 text-center text-faint">
          <p class="text-[13px]">{{ t('today.nothing') }}</p>
          <button v-if="canEdit && hasCity" type="button" class="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-field border border-line-focus text-sky-soft text-[12px] font-semibold" @click="openAdd(todayISO || null)">
            <UIcon name="i-heroicons-plus" class="w-3.5 h-3.5" /> {{ t('timetable.add') }}
          </button>
        </div>

        <div v-else class="space-y-1.5 pl-1">
          <!-- city arrival marker -->
          <template v-for="e in grp.items" :key="e.id || (e._city + '-loc')">
            <div v-if="e._synthetic" class="flex items-center gap-2.5 px-1 py-1">
              <UIcon name="i-heroicons-flag" class="w-4 h-4 text-sky-soft shrink-0" />
              <span class="text-[13px] font-semibold text-sky-soft">{{ e.title }}</span>
              <span class="text-[11px] text-faint">{{ t('timetable.inCity') }}</span>
            </div>

            <div
              v-else
              class="flex items-start gap-3 px-3 py-2.5 rounded-card bg-surface border border-line transition-colors"
              :class="canEdit ? 'cursor-pointer hover:border-line-focus' : ''"
              @click="openEdit(e)"
            >
              <div class="w-14 shrink-0 text-right mono text-[11px] text-faint pt-0.5">
                <template v-if="e.time">{{ e.time }}<template v-if="e._kind === 'transport' && e.endTime"><br>{{ e.endTime }}</template></template>
                <template v-else>—</template>
              </div>
              <button
                type="button"
                class="w-[18px] h-[18px] rounded-[5px] shrink-0 mt-0.5 flex items-center justify-center transition-colors"
                :class="e.done ? 'bg-bought' : 'border-2 border-[#2a3a4e]'"
                :disabled="!canEdit"
                @click.stop="toggleDone(e)"
              >
                <UIcon v-if="e.done" name="i-heroicons-check" class="w-3 h-3 text-on-accent" />
              </button>
              <UIcon :name="KIND_META[e._kind].icon" class="w-4 h-4 shrink-0 mt-0.5" :class="KIND_META[e._kind].color" />
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="text-[13px]" :class="e.done ? 'line-through text-muted' : 'text-ink'">{{ e.title }}</span>
                  <span class="text-[10px] text-sky-soft bg-chip-sky px-1.5 py-0.5 rounded-[5px]">{{ e._city }}</span>
                  <span v-if="e.price != null" class="mono text-[11px] text-planned">{{ e.price.toFixed(0) }} {{ e.currency }}</span>
                </div>
                <div v-if="e._kind === 'transport' && (e.fromLoc || e.toLoc)" class="text-[11.5px] text-conv-soft mt-0.5 flex items-center gap-1">
                  <span>{{ e.fromLoc || '?' }}</span><UIcon name="i-heroicons-arrow-long-right" class="w-3.5 h-3.5" /><span>{{ e.toLoc || '?' }}</span>
                </div>
                <p v-if="e.notes" class="text-[11px] text-faint mt-0.5">{{ e.notes }}</p>
                <div v-if="e.assignees && e.assignees.length" class="flex items-center gap-1.5 flex-wrap mt-1.5">
                  <span v-for="a in e.assignees" :key="a.id" class="inline-flex items-center gap-1 pl-0.5 pr-2 py-0.5 rounded-full bg-surface-2 border border-line text-[11px] text-muted">
                    <span class="w-3.5 h-3.5 rounded-full flex items-center justify-center text-[8px] font-bold text-on-accent shrink-0" :class="personColorClass(a.color)">{{ initial(a.name) }}</span>
                    {{ a.name }}
                  </span>
                </div>
                <div v-if="(e.attachments && e.attachments.length) || e.url" class="flex items-center gap-2 mt-1.5 flex-wrap">
                  <a v-for="att in e.attachments" :key="att.id" :href="att.path" target="_blank" :title="att.name" @click.stop>
                    <img v-if="isImage(att.path)" :src="att.path" alt="" class="h-12 w-12 rounded-md border border-line object-cover" />
                    <span v-else class="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-line text-[11px] text-bought"><UIcon name="i-heroicons-document-text" class="w-3.5 h-3.5" /> {{ t('planner.openTicket') }}</span>
                  </a>
                  <a v-if="e.url" :href="e.url" target="_blank" class="inline-flex items-center gap-1 text-[11px] text-sky hover:underline" @click.stop><UIcon name="i-heroicons-arrow-top-right-on-square" class="w-3.5 h-3.5" /> {{ t('planner.openLink') }}</a>
                </div>
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>

    <ItineraryItemModal
      v-model="showItem"
      :event="event"
      :item="editItem"
      :default-date="addDate"
      :can-edit="canEdit"
    />
  </div>
</template>
