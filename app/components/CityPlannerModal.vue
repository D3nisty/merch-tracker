<script setup lang="ts">
import { useEventsStore, type Location, type ItineraryItem, type ItineraryKind } from '~/stores/events'
import { usePersonsStore } from '~/stores/persons'
import { useAuthStore } from '~/stores/auth'
import { useLocale } from '~/composables/useLocale'
import { usePersonColor } from '~/composables/usePersonColor'

const props = defineProps<{ modelValue: boolean; location: Location; canEdit: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [v: boolean] }>()

const store = useEventsStore()
const personsStore = usePersonsStore()
const authStore = useAuthStore()
const { t } = useLocale()
const { personColorClass, initial } = usePersonColor()

const KINDS: { key: ItineraryKind; icon: string; color: string; label: () => string }[] = [
  { key: 'activity', icon: 'i-heroicons-map-pin', color: 'text-sky', label: () => t('planner.kindActivity') },
  { key: 'ticket', icon: 'i-heroicons-ticket', color: 'text-planned', label: () => t('planner.kindTicket') },
  { key: 'food', icon: 'i-heroicons-cake', color: 'text-orange-400', label: () => t('planner.kindFood') },
  { key: 'transport', icon: 'i-heroicons-arrow-right-circle', color: 'text-conv-soft', label: () => t('planner.kindTransport') },
  { key: 'note', icon: 'i-heroicons-pencil', color: 'text-muted', label: () => t('planner.kindNote') },
]
function kindMeta(k: ItineraryKind) { return KINDS.find(m => m.key === k) ?? KINDS[0] }

// ── Logistics ───────────────────────────────────────────────────────────
const transport = ref(props.location.transport ?? '')
const accommodation = ref(props.location.accommodation ?? '')
watch(() => props.location, (l) => { transport.value = l.transport ?? ''; accommodation.value = l.accommodation ?? '' })
async function saveLogistics() {
  if (!props.canEdit) return
  await store.updateLocation(props.location.id, { transport: transport.value || null, accommodation: accommodation.value || null })
}

// ── Itinerary (non-shopping) grouped by day + wishlist (shopping) ────────
const items = computed(() => props.location.itinerary ?? [])
const dayGroups = computed(() => {
  const map = new Map<string, ItineraryItem[]>()
  for (const it of items.value) {
    if (it.kind === 'shopping') continue
    const key = it.date || ''
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(it)
  }
  return [...map.entries()]
    .sort((a, b) => (a[0] === '' ? 1 : b[0] === '' ? -1 : a[0] < b[0] ? -1 : 1))
    .map(([date, list]) => ({ date, items: list.sort((x, y) => (x.time || '').localeCompare(y.time || '') || x.sortOrder - y.sortOrder) }))
})
const wishlist = computed(() => items.value.filter(i => i.kind === 'shopping'))

function fmtDay(d: string) {
  return new Date(d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}
const isImage = (p: string | null) => !!p && /\.(png|jpe?g|gif|webp|heic|avif)$/i.test(p)

// ── Budget rollup: shop products (per active person) + wishlist ──────────
const pid = computed(() => personsStore.currentPersonId ?? store.currentEvent?.viewerPersonId ?? authStore.user?.personId ?? null)
function addMap(target: Record<string, number>, src: Record<string, number>) {
  for (const [k, v] of Object.entries(src)) target[k] = (target[k] ?? 0) + v
}
const budget = computed(() => {
  const planned: Record<string, number> = {}
  const spent: Record<string, number> = {}
  for (const b of props.location.booths ?? []) {
    addMap(planned, store.getBoothPlannedByCurrency(b.id, pid.value))
    const gross = store.getBoothPaidByCurrency(b.id, pid.value)
    const sav = store.getBoothSavingsByCurrency(b.id, pid.value)
    const net: Record<string, number> = { ...gross }
    for (const [c, s] of Object.entries(sav)) net[c] = (net[c] ?? 0) - s
    addMap(spent, net)
  }
  for (const w of wishlist.value) {
    if (w.price == null) continue
    if (w.done) spent[w.currency] = (spent[w.currency] ?? 0) + w.price
    else planned[w.currency] = (planned[w.currency] ?? 0) + w.price
  }
  const fmt = (m: Record<string, number>) => Object.entries(m).filter(([, v]) => Math.abs(v) > 0.005).map(([c, v]) => `${v.toFixed(0)} ${c}`).join(' · ')
  return { planned: fmt(planned), spent: fmt(spent) }
})

// ── Add / edit via the shared modal (people + attachments + all fields) ───
const showItemModal = ref(false)
const modalItem = ref<ItineraryItem | null>(null)
const addKind = ref<ItineraryKind>('activity')
function openAdd(kind: ItineraryKind) {
  if (!props.canEdit) return
  modalItem.value = null
  addKind.value = kind
  showItemModal.value = true
}

async function toggleDone(it: ItineraryItem) {
  if (!props.canEdit) return
  await store.updateItineraryItem(it.id, { done: !it.done })
}
async function removeItem(it: ItineraryItem) {
  await store.deleteItineraryItem(it.id)
}

function openEdit(it: ItineraryItem) {
  if (!props.canEdit) return
  modalItem.value = it
  showItemModal.value = true
}
const attachInput = ref<HTMLInputElement | null>(null)
const attachTarget = ref<string | null>(null)
const uploading = ref(false)
function pickAttach(it: ItineraryItem) { attachTarget.value = it.id; attachInput.value?.click() }
async function onAttach(e: Event) {
  const files = Array.from((e.target as HTMLInputElement).files ?? [])
  if (files.length && attachTarget.value) {
    uploading.value = true
    try { await store.uploadItineraryAttachments(attachTarget.value, files) } finally { uploading.value = false }
  }
  if (attachInput.value) attachInput.value.value = ''
  attachTarget.value = null
}
async function removeAttachment(it: ItineraryItem, attachmentId: string) {
  await store.deleteItineraryAttachment(it.id, attachmentId)
}
</script>

<template>
  <UModal :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)" :ui="{ width: 'w-full sm:max-w-2xl' }">
    <UCard>
      <template #header>
        <div class="flex items-center justify-between gap-3">
          <div class="min-w-0">
            <h3 class="font-bold text-ink-strong text-base truncate flex items-center gap-2">
              <UIcon name="i-heroicons-calendar-days" class="w-4 h-4 text-sky shrink-0" /> {{ location.name }}
            </h3>
            <p v-if="location.dateFrom" class="text-[11.5px] text-muted mt-0.5">
              {{ fmtDay(location.dateFrom) }}<template v-if="location.dateTo && location.dateTo !== location.dateFrom"> – {{ fmtDay(location.dateTo) }}</template>
            </p>
          </div>
          <button type="button" class="text-faint hover:text-ink shrink-0" @click="emit('update:modelValue', false)">
            <UIcon name="i-heroicons-x-mark" class="w-4.5 h-4.5" />
          </button>
        </div>
      </template>

      <div class="space-y-5 max-h-[68vh] overflow-y-auto pr-0.5">
        <!-- Logistics -->
        <div>
          <div class="text-[11px] font-bold uppercase tracking-[0.08em] text-faint mb-2">{{ t('planner.logistics') }}</div>
          <div class="grid sm:grid-cols-2 gap-2.5">
            <div>
              <label class="block text-[11px] text-muted mb-1 flex items-center gap-1"><UIcon name="i-heroicons-arrow-right-circle" class="w-3 h-3" /> {{ t('planner.transport') }}</label>
              <input v-model="transport" :disabled="!canEdit" :placeholder="t('planner.transportPlaceholder')" class="w-full px-3 py-2 rounded-field border border-line bg-surface-2 text-[13px] text-ink outline-none focus:border-line-focus" @change="saveLogistics" />
            </div>
            <div>
              <label class="block text-[11px] text-muted mb-1 flex items-center gap-1"><UIcon name="i-heroicons-home-modern" class="w-3 h-3" /> {{ t('planner.accommodation') }}</label>
              <input v-model="accommodation" :disabled="!canEdit" :placeholder="t('planner.accommodationPlaceholder')" class="w-full px-3 py-2 rounded-field border border-line bg-surface-2 text-[13px] text-ink outline-none focus:border-line-focus" @change="saveLogistics" />
            </div>
          </div>
        </div>

        <!-- Budget -->
        <div v-if="budget.planned || budget.spent" class="flex items-center gap-4 px-3.5 py-2.5 rounded-card bg-surface-2 border border-line">
          <div class="text-[10px] uppercase tracking-[0.05em] text-faint">{{ t('planner.budget') }}</div>
          <div class="flex items-center gap-4 ml-auto">
            <div class="text-right"><div class="text-[9px] uppercase text-faint">{{ t('planner.planned') }}</div><div class="mono text-[13px] font-semibold text-planned">{{ budget.planned || '—' }}</div></div>
            <div class="w-px h-6 bg-line" />
            <div class="text-right"><div class="text-[9px] uppercase text-faint">{{ t('planner.spent') }}</div><div class="mono text-[13px] font-semibold text-bought">{{ budget.spent || '—' }}</div></div>
          </div>
        </div>

        <!-- Itinerary -->
        <div>
          <div class="flex items-center justify-between mb-2">
            <div class="text-[11px] font-bold uppercase tracking-[0.08em] text-faint">{{ t('planner.itinerary') }}</div>
            <button v-if="canEdit" class="flex items-center gap-1 text-xs text-sky-soft hover:text-sky" @click="openAdd('activity')">
              <UIcon name="i-heroicons-plus" class="w-3.5 h-3.5" /> {{ t('planner.addItem') }}
            </button>
          </div>

          <p v-if="!dayGroups.length" class="text-xs text-faint py-2">{{ t('planner.emptyItinerary') }}</p>

          <div v-for="grp in dayGroups" :key="grp.date || 'anytime'" class="mb-3">
            <div class="text-[11px] font-semibold text-sky-soft mb-1.5">{{ grp.date ? fmtDay(grp.date) : t('planner.anytime') }}</div>
            <div class="rounded-card border border-line divide-y divide-line-hair">
              <div v-for="it in grp.items" :key="it.id" class="flex items-start gap-2.5 px-3 py-2.5">
                <button type="button" class="w-[18px] h-[18px] rounded-[5px] shrink-0 mt-0.5 flex items-center justify-center transition-colors" :class="it.done ? 'bg-bought' : 'border-2 border-[#2a3a4e]'" :disabled="!canEdit" @click="toggleDone(it)">
                  <UIcon v-if="it.done" name="i-heroicons-check" class="w-3 h-3 text-on-accent" />
                </button>
                <UIcon :name="kindMeta(it.kind).icon" class="w-4 h-4 shrink-0 mt-0.5" :class="kindMeta(it.kind).color" />
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 flex-wrap">
                    <span v-if="it.time" class="mono text-[11px] text-faint">{{ it.time }}<template v-if="it.kind === 'transport' && it.endTime">–{{ it.endTime }}</template></span>
                    <span class="text-[13px]" :class="it.done ? 'line-through text-muted' : 'text-ink'">{{ it.title }}</span>
                    <span v-if="it.price != null" class="mono text-[11px] text-planned">{{ it.price.toFixed(0) }} {{ it.currency }}</span>
                  </div>
                  <div v-if="it.kind === 'transport' && (it.fromLoc || it.toLoc)" class="text-[11.5px] text-conv-soft mt-0.5 flex items-center gap-1">
                    <span>{{ it.fromLoc || '?' }}</span><UIcon name="i-heroicons-arrow-long-right" class="w-3.5 h-3.5" /><span>{{ it.toLoc || '?' }}</span>
                  </div>
                  <p v-if="it.notes" class="text-[11px] text-faint mt-0.5">{{ it.notes }}</p>
                  <!-- assigned people -->
                  <div v-if="it.assignees && it.assignees.length" class="flex items-center gap-1.5 flex-wrap mt-1.5">
                    <span v-for="a in it.assignees" :key="a.id" class="inline-flex items-center gap-1 pl-0.5 pr-2 py-0.5 rounded-full bg-surface-2 border border-line text-[11px] text-muted">
                      <span class="w-3.5 h-3.5 rounded-full flex items-center justify-center text-[8px] font-bold text-on-accent shrink-0" :class="personColorClass(a.color)">{{ initial(a.name) }}</span>
                      {{ a.name }}
                    </span>
                  </div>
                  <!-- tickets / QRs (multiple) + link -->
                  <div v-if="(it.attachments && it.attachments.length) || it.url" class="flex items-center gap-2 mt-1.5 flex-wrap">
                    <div v-for="att in it.attachments" :key="att.id" class="relative group/att">
                      <a v-if="isImage(att.path)" :href="att.path" target="_blank" :title="att.name">
                        <img :src="att.path" alt="" class="h-14 w-14 rounded-md border border-line object-cover" />
                      </a>
                      <a v-else :href="att.path" target="_blank" class="inline-flex items-center gap-1 px-2 py-1.5 rounded-md border border-line text-[11px] text-bought hover:border-bought" :title="att.name">
                        <UIcon name="i-heroicons-document-text" class="w-3.5 h-3.5" /> {{ att.name.length > 16 ? att.name.slice(0, 14) + '…' : att.name }}
                      </a>
                      <button v-if="canEdit" type="button" class="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-must text-chip-must flex items-center justify-center opacity-0 group-hover/att:opacity-100 transition-opacity" @click.stop="removeAttachment(it, att.id)"><UIcon name="i-heroicons-x-mark" class="w-2.5 h-2.5" /></button>
                    </div>
                    <a v-if="it.url" :href="it.url" target="_blank" class="inline-flex items-center gap-1 text-[11px] text-sky hover:underline">
                      <UIcon name="i-heroicons-arrow-top-right-on-square" class="w-3.5 h-3.5" /> {{ t('planner.openLink') }}
                    </a>
                  </div>
                </div>
                <div v-if="canEdit" class="flex items-center gap-1 shrink-0">
                  <button class="text-faint hover:text-sky" :title="t('common.edit')" @click="openEdit(it)"><UIcon name="i-heroicons-pencil-square" class="w-4 h-4" /></button>
                  <button class="text-faint hover:text-sky" :title="t('planner.attach')" @click="pickAttach(it)"><UIcon name="i-heroicons-paper-clip" class="w-4 h-4" /></button>
                  <button class="text-faint hover:text-must" @click="removeItem(it)"><UIcon name="i-heroicons-trash" class="w-4 h-4" /></button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Wishlist -->
        <div>
          <div class="flex items-center justify-between mb-2">
            <div class="text-[11px] font-bold uppercase tracking-[0.08em] text-faint">{{ t('planner.wishlist') }}</div>
            <button v-if="canEdit" class="flex items-center gap-1 text-xs text-bought hover:text-bought" @click="openAdd('shopping')">
              <UIcon name="i-heroicons-plus" class="w-3.5 h-3.5" /> {{ t('planner.addWish') }}
            </button>
          </div>
          <p v-if="!wishlist.length" class="text-xs text-faint py-2">{{ t('planner.emptyWishlist') }}</p>
          <div v-else class="rounded-card border border-line divide-y divide-line-hair">
            <div v-for="w in wishlist" :key="w.id" class="flex items-center gap-2.5 px-3 py-2.5">
              <button type="button" class="w-[18px] h-[18px] rounded-[5px] shrink-0 flex items-center justify-center transition-colors" :class="w.done ? 'bg-bought' : 'border-2 border-[#2a3a4e]'" :disabled="!canEdit" @click="toggleDone(w)">
                <UIcon v-if="w.done" name="i-heroicons-check" class="w-3 h-3 text-on-accent" />
              </button>
              <UIcon name="i-heroicons-shopping-bag" class="w-4 h-4 text-bought shrink-0" />
              <span class="flex-1 min-w-0 text-[13px] truncate" :class="w.done ? 'line-through text-muted' : 'text-ink'">{{ w.title }}</span>
              <a v-if="w.url" :href="w.url" target="_blank" class="text-faint hover:text-sky shrink-0" @click.stop><UIcon name="i-heroicons-arrow-top-right-on-square" class="w-3.5 h-3.5" /></a>
              <span v-if="w.price != null" class="mono text-[12px] font-semibold shrink-0" :class="w.done ? 'text-bought' : 'text-planned'">{{ w.price.toFixed(0) }} {{ w.currency }}</span>
              <button v-if="canEdit" class="text-faint hover:text-sky shrink-0" :title="t('common.edit')" @click="openEdit(w)"><UIcon name="i-heroicons-pencil-square" class="w-4 h-4" /></button>
              <button v-if="canEdit" class="text-faint hover:text-must shrink-0" @click="removeItem(w)"><UIcon name="i-heroicons-trash" class="w-4 h-4" /></button>
            </div>
          </div>
        </div>

      </div>

      <input ref="attachInput" type="file" accept="image/*,application/pdf" multiple class="hidden" @change="onAttach" />

      <ItineraryItemModal
        v-if="store.currentEvent"
        v-model="showItemModal"
        :event="store.currentEvent"
        :item="modalItem"
        :lock-location-id="location.id"
        :default-location-id="location.id"
        :default-date="location.dateFrom"
        :default-kind="addKind"
        :can-edit="canEdit"
      />
    </UCard>
  </UModal>
</template>
