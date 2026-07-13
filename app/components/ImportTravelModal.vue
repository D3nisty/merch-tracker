<script setup lang="ts">
import { useEventsStore, type Event } from '~/stores/events'
import { useLocale } from '~/composables/useLocale'
import { useItineraryImport, type ItineraryBlock } from '~/composables/useItineraryImport'

// When `targetEvent` is passed the modal runs in APPEND mode: it merges the
// parsed stops into that existing trip, de-duplicating cities (same name +
// same dates) and day-items (same date + title) instead of creating a new event.
const props = defineProps<{ modelValue: boolean; targetEvent?: Event | null }>()
const emit = defineEmits<{ 'update:modelValue': [v: boolean] }>()

const store = useEventsStore()
const router = useRouter()
const { t } = useLocale()
const { parseItinerary } = useItineraryImport()

const appendMode = computed(() => !!props.targetEvent)

const fileInput = ref<HTMLInputElement | null>(null)
const parsing = ref(false)
const committing = ref(false)
const error = ref('')
const eventName = ref('')
const eventTypeChoice = ref<'travel' | 'convention'>('travel')
const dayCount = ref(0)

type EditBlock = ItineraryBlock & { include: boolean; expanded: boolean }
const blocks = ref<EditBlock[]>([])

const evType = computed(() => props.targetEvent?.type ?? eventTypeChoice.value)

function reset() {
  parsing.value = false
  committing.value = false
  error.value = ''
  eventName.value = ''
  eventTypeChoice.value = 'travel'
  dayCount.value = 0
  blocks.value = []
}
watch(() => props.modelValue, (open) => { if (!open) reset() })

// ── de-dupe against the existing trip ────────────────────────────────────
const norm = (s: string) => (s ?? '').toLowerCase().replace(/\s+/g, ' ').trim()
const existingCities = computed(() => (props.targetEvent?.locations ?? []).filter(l => l.type !== 'hall'))

interface Plan {
  matchLoc: { id: string } | null
  items: { date: string | null; title: string; dup: boolean }[]
  newCount: number
  dupCount: number
  fullyDup: boolean
}
function planFor(b: EditBlock): Plan {
  const items = (b.days ?? [])
    .map(d => ({ date: d.date, title: (d.note ?? '').trim().slice(0, 120) }))
    .filter(x => x.title)
  let matchLoc: any = null
  if (appendMode.value) {
    matchLoc = existingCities.value.find(l =>
      norm(l.name) === norm(b.name)
      && (l.dateFrom ?? '') === (b.dateFrom ?? '')
      && (l.dateTo ?? '') === (b.dateTo ?? ''),
    ) ?? null
  }
  const existingKeys = new Set((matchLoc?.itinerary ?? []).map((i: any) => `${i.date ?? ''}|${norm(i.title)}`))
  const withDup = items.map(x => ({ ...x, dup: existingKeys.has(`${x.date ?? ''}|${norm(x.title)}`) }))
  const newCount = withDup.filter(x => !x.dup).length
  return { matchLoc, items: withDup, newCount, dupCount: withDup.length - newCount, fullyDup: !!matchLoc && newCount === 0 }
}
const plans = computed(() => blocks.value.map(planFor))
function willAdd(i: number): boolean {
  const b = blocks.value[i]; const p = plans.value[i]
  return b.include && !!b.name.trim() && (p.matchLoc == null || p.newCount > 0)
}

const newStopCount = computed(() => blocks.value.filter((b, i) => willAdd(i) && plans.value[i].matchLoc == null).length)
const itemsToAdd = computed(() => blocks.value.reduce((n, _b, i) => n + (willAdd(i) ? plans.value[i].newCount : 0), 0))
const addableCount = computed(() => blocks.value.filter((_b, i) => willAdd(i)).length)
const dupStops = computed(() => plans.value.filter(p => p.fullyDup).length)

async function onFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  parsing.value = true
  error.value = ''
  try {
    const parsed = await parseItinerary(file)
    if (!parsed.blocks.length) {
      error.value = t('import.errorEmpty')
      blocks.value = []
    } else {
      if (!appendMode.value) eventName.value = parsed.suggestedName
      dayCount.value = parsed.rows.length
      blocks.value = parsed.blocks.map(b => ({ ...b, include: true, expanded: false }))
      // Default-skip stops that are already fully in the trip.
      if (appendMode.value) blocks.value.forEach((b) => { if (planFor(b).fullyDup) b.include = false })
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : t('import.errorParse')
  } finally {
    parsing.value = false
    if (fileInput.value) fileInput.value.value = ''
  }
}

function fmt(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

async function commit() {
  const included = blocks.value.filter((b, i) => willAdd(i))
  if (!included.length) return
  if (!appendMode.value && !eventName.value.trim()) return
  committing.value = true
  error.value = ''
  const locType = evType.value === 'convention' ? 'hall' : 'city'
  const makeItems = evType.value !== 'convention'
  try {
    if (appendMode.value) {
      const ev = props.targetEvent!
      for (const b of included) {
        const plan = planFor(b)
        let locId = plan.matchLoc?.id
        if (!locId) {
          const loc = await $fetch<{ id: string }>('/api/locations', {
            method: 'POST',
            body: { eventId: ev.id, name: b.name.trim(), type: locType, dateFrom: b.dateFrom, dateTo: b.dateTo, transport: b.transport || null, accommodation: b.accommodation || null, notes: b.notes || null },
          })
          locId = loc.id
        }
        if (makeItems) {
          for (const it of plan.items) {
            if (it.dup) continue
            await $fetch('/api/itinerary', { method: 'POST', body: { locationId: locId, kind: 'activity', title: it.title, date: it.date } })
          }
        }
      }
      await store.fetchEvent(ev.slug ?? ev.id)
      emit('update:modelValue', false)
    } else {
      const froms = included.map(b => b.dateFrom).filter(Boolean).sort() as string[]
      const tos = included.map(b => b.dateTo).filter(Boolean).sort() as string[]
      const created = await store.createEvent({
        name: eventName.value.trim(), type: evType.value,
        date: froms[0] ?? null, dateTo: tos.length ? tos[tos.length - 1] : null,
      })
      for (const b of included) {
        const loc = await $fetch<{ id: string }>('/api/locations', {
          method: 'POST',
          body: { eventId: created.id, name: b.name.trim(), type: locType, dateFrom: b.dateFrom, dateTo: b.dateTo, transport: b.transport || null, accommodation: b.accommodation || null, notes: b.notes || null },
        })
        if (makeItems) {
          for (const day of b.days) {
            const note = (day.note || '').trim()
            if (!note) continue
            await $fetch('/api/itinerary', { method: 'POST', body: { locationId: loc.id, kind: 'activity', title: note.slice(0, 120), date: day.date } })
          }
        }
      }
      emit('update:modelValue', false)
      router.push(`/events/${created.slug ?? created.id}`)
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : t('import.errorCreate')
  } finally {
    committing.value = false
  }
}
</script>

<template>
  <UModal :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)" :ui="{ width: 'w-full sm:max-w-xl' }">
    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <h3 class="font-bold text-ink-strong text-base flex items-center gap-2">
            <UIcon name="i-heroicons-arrow-up-tray" class="w-4 h-4 text-sky" />
            {{ appendMode ? t('import.addTitle') : t('import.title') }}
          </h3>
          <button type="button" class="text-faint hover:text-ink" @click="emit('update:modelValue', false)">
            <UIcon name="i-heroicons-x-mark" class="w-4.5 h-4.5" />
          </button>
        </div>
      </template>

      <!-- Step 1: pick a file -->
      <div v-if="!blocks.length">
        <p v-if="appendMode" class="text-[12.5px] text-muted mb-3">{{ t('import.addingTo', { name: targetEvent!.name }) }}</p>
        <button
          type="button"
          class="w-full border-[1.5px] border-dashed border-line-focus rounded-window bg-surface-2 py-8 px-4 text-center hover:border-sky transition-colors"
          :disabled="parsing"
          @click="fileInput?.click()"
        >
          <div class="w-11 h-11 mx-auto mb-2.5 rounded-field bg-chip-sky flex items-center justify-center">
            <UIcon :name="parsing ? 'i-heroicons-arrow-path' : 'i-heroicons-document-arrow-up'" class="w-5 h-5 text-sky-soft" :class="parsing ? 'animate-spin' : ''" />
          </div>
          <div class="text-sm font-semibold text-ink">{{ parsing ? t('import.parsing') : t('import.chooseFile') }}</div>
          <div class="text-xs text-faint mt-1">{{ t('import.formats') }}</div>
        </button>
        <input ref="fileInput" type="file" accept=".xlsx,.xls,.csv" class="hidden" @change="onFile" />
        <p class="text-[11.5px] text-faint mt-3 leading-relaxed">{{ t('import.columnsHint') }}</p>
        <p v-if="error" class="text-must text-xs mt-3">{{ error }}</p>
      </div>

      <!-- Step 2: preview + edit -->
      <div v-else class="space-y-4">
        <!-- create mode: name + type -->
        <template v-if="!appendMode">
          <div>
            <label class="block text-xs font-semibold text-muted mb-1.5">{{ t('import.eventName') }}</label>
            <input v-model="eventName" class="w-full px-3.5 py-2.5 rounded-field border border-line-focus bg-surface-2 text-sm text-ink outline-none focus:border-line-focus" />
          </div>
          <div>
            <label class="block text-xs font-semibold text-muted mb-1.5">{{ t('import.type') }}</label>
            <div class="flex gap-1 p-1 rounded-[11px] border border-line bg-surface-2 w-max">
              <button
                v-for="ty in (['travel','convention'] as const)" :key="ty" type="button"
                class="px-4 py-1.5 rounded-[8px] text-[12.5px] flex items-center gap-1.5 transition-colors"
                :class="eventTypeChoice === ty ? (ty === 'travel' ? 'bg-sky text-on-accent font-bold' : 'grad-conv font-bold') : 'text-muted hover:text-ink font-medium'"
                @click="eventTypeChoice = ty"
              >
                <UIcon :name="ty === 'travel' ? 'i-heroicons-globe-europe-africa' : 'i-heroicons-building-storefront'" class="w-3.5 h-3.5" />
                {{ ty === 'travel' ? t('import.typeTravel') : t('import.typeConvention') }}
              </button>
            </div>
          </div>
        </template>
        <p v-else class="text-[12.5px] text-muted">{{ t('import.addingTo', { name: targetEvent!.name }) }}</p>

        <div class="flex items-center justify-between">
          <span class="text-[11px] font-bold uppercase tracking-[0.08em] text-faint">{{ t('import.detected') }}</span>
          <span class="text-xs text-muted">
            <template v-if="appendMode">{{ t('import.willAddSummary', { cities: newStopCount, items: itemsToAdd }) }}<template v-if="dupStops"> · {{ t('import.dupSummary', { n: dupStops }) }}</template></template>
            <template v-else>{{ t('import.summary', { days: dayCount, cities: addableCount }) }}</template>
          </span>
        </div>

        <div class="rounded-card border border-line divide-y divide-line-hair max-h-[46vh] overflow-y-auto">
          <div v-for="(b, i) in blocks" :key="i" :class="b.include ? '' : 'opacity-45'">
            <div class="flex items-center gap-2.5 px-3 py-2.5">
              <button
                type="button"
                class="w-[18px] h-[18px] rounded-[5px] shrink-0 flex items-center justify-center transition-colors"
                :class="b.include ? 'bg-sky' : 'border-2 border-[#2a3a4e]'"
                @click="b.include = !b.include"
              >
                <UIcon v-if="b.include" name="i-heroicons-check" class="w-3 h-3 text-on-accent" />
              </button>
              <input v-model="b.name" class="flex-1 min-w-0 bg-transparent text-[13.5px] text-ink outline-none border-0 p-0 focus:ring-0" />
              <!-- append: per-stop dedupe status -->
              <span v-if="appendMode && plans[i].fullyDup" class="text-[10px] text-faint bg-surface-2 border border-line rounded px-1.5 py-0.5 shrink-0">{{ t('import.alreadyInTrip') }}</span>
              <span v-else-if="appendMode && plans[i].matchLoc" class="text-[10px] text-planned bg-chip-sky/40 border border-line rounded px-1.5 py-0.5 shrink-0">{{ t('import.mergesInto', { n: plans[i].newCount, m: plans[i].dupCount }) }}</span>
              <span v-else-if="appendMode" class="text-[10px] text-bought bg-chip-bought border border-line rounded px-1.5 py-0.5 shrink-0">{{ t('import.newStop') }}</span>
              <span class="mono text-[11px] text-sky-soft shrink-0">{{ fmt(b.dateFrom) }}<template v-if="b.dateTo && b.dateTo !== b.dateFrom"> – {{ fmt(b.dateTo) }}</template></span>
              <span class="text-[10px] text-faint bg-surface-2 border border-line rounded px-1.5 py-0.5 shrink-0">{{ b.dayCount }}d</span>
              <button type="button" class="text-faint hover:text-ink shrink-0" @click="b.expanded = !b.expanded">
                <UIcon :name="b.expanded ? 'i-heroicons-chevron-up' : 'i-heroicons-chevron-down'" class="w-4 h-4" />
              </button>
            </div>
            <!-- expanded: exactly what will be added -->
            <div v-if="b.expanded" class="px-3 pb-3 pl-11 space-y-1">
              <p v-if="!plans[i].items.length" class="text-[11.5px] text-faint">{{ t('import.noItems') }}</p>
              <div v-for="(it, j) in plans[i].items" :key="j" class="flex items-center gap-2 text-[11.5px]" :class="it.dup ? 'text-faint line-through' : 'text-muted'">
                <UIcon :name="it.dup ? 'i-heroicons-minus-circle' : 'i-heroicons-plus-circle'" class="w-3.5 h-3.5 shrink-0" :class="it.dup ? 'text-faint' : 'text-bought'" />
                <span class="mono text-[10.5px] text-faint shrink-0 w-14">{{ fmt(it.date) }}</span>
                <span class="truncate">{{ it.title }}</span>
                <span v-if="it.dup" class="text-[10px] text-faint shrink-0 ml-auto">{{ t('import.skip') }}</span>
              </div>
              <p v-if="appendMode && plans[i].matchLoc" class="text-[10.5px] text-faint pt-0.5">{{ t('import.mergeNote') }}</p>
            </div>
          </div>
        </div>

        <p v-if="error" class="text-must text-xs">{{ error }}</p>
      </div>

      <template #footer>
        <div class="flex justify-end gap-2.5">
          <button class="px-4 py-2 rounded-field text-[13px] font-semibold text-muted hover:text-ink" @click="emit('update:modelValue', false)">{{ t('common.cancel') }}</button>
          <button
            v-if="blocks.length"
            class="px-4 py-2 rounded-field grad-primary text-[13px] font-bold disabled:opacity-50"
            :disabled="committing || !addableCount || (!appendMode && !eventName.trim())"
            @click="commit"
          >{{ committing ? '…' : (appendMode ? t('import.addButton', { n: addableCount }) : t('import.createTrip', { n: addableCount })) }}</button>
        </div>
      </template>
    </UCard>
  </UModal>
</template>
