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
    <!-- header: add entry -->
    <div v-if="canEdit && hasCity" class="flex justify-end mb-3">
      <button
        type="button"
        class="flex items-center gap-1.5 px-3 py-1.5 rounded-field grad-primary text-[12.5px] font-bold"
        @click="openAdd(null)"
      >
        <UIcon name="i-heroicons-plus" class="w-3.5 h-3.5" /> {{ t('timetable.add') }}
      </button>
    </div>

    <div v-if="!hasAny" class="text-center py-16 text-faint">
      <UIcon name="i-heroicons-calendar-days" class="w-12 h-12 mx-auto mb-3 text-faint-2" />
      <p>{{ t('timetable.empty') }}</p>
      <p class="text-sm mt-1">{{ t('timetable.emptyHint') }}</p>
      <button v-if="canEdit && hasCity" type="button" class="mt-4 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-field grad-primary text-[12.5px] font-bold" @click="openAdd(null)">
        <UIcon name="i-heroicons-plus" class="w-3.5 h-3.5" /> {{ t('timetable.add') }}
      </button>
    </div>

    <div v-else class="relative space-y-6">
      <div v-for="grp in dayGroups" :key="grp.date || 'anytime'">
        <div class="flex items-center gap-2 mb-2.5">
          <h3 class="text-[13px] font-bold text-ink-strong">{{ grp.date ? fmtDay(grp.date) : t('planner.anytime') }}</h3>
          <div class="flex-1 h-px bg-line-soft" />
          <button v-if="canEdit && hasCity && grp.date" type="button" class="text-faint hover:text-sky shrink-0" :title="t('timetable.addOnDay')" @click="openAdd(grp.date)">
            <UIcon name="i-heroicons-plus-circle" class="w-4 h-4" />
          </button>
        </div>

        <div class="space-y-1.5 pl-1">
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
