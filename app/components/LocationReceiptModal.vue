<script setup lang="ts">
import { useEventsStore, type LocationReceipt, type Product, type LocationReceiptItem } from '~/stores/events'
import { useAuthStore } from '~/stores/auth'
import { usePersonsStore } from '~/stores/persons'
import { useCurrencyStore } from '~/stores/currency'
import { useLocale } from '~/composables/useLocale'

const props = defineProps<{
  modelValue: boolean
  receipt: LocationReceipt
  locationId: string
  /**
   * Whether the viewer can edit the parent event. Drives the delete-receipt /
   * add-custom-item / edit-payer affordances. Marking items for YOUR OWN
   * person works for any logged-in viewer with a Person id, mirroring how
   * `ProductItem` gates checkboxes.
   */
  canEdit: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [v: boolean] }>()

const store = useEventsStore()
const authStore = useAuthStore()
const personsStore = usePersonsStore()
const currencyStore = useCurrencyStore()
const { t } = useLocale()

const canMark = computed(() => authStore.isLoggedIn && !!store.currentEvent?.viewerPersonId)
const viewerPersonId = computed(() => store.currentEvent?.viewerPersonId ?? null)
const fullscreen = ref(false)
const confirmingDelete = ref(false)
const deleting = ref(false)
const deleteError = ref('')

const displayName = computed(() => props.receipt.customName || props.receipt.originalName || t('catalog.receipt'))

// ── Person color palette ────────────────────────────────────────────────
const COLOR_BG: Record<string, string> = {
  purple: 'bg-purple-500', blue: 'bg-blue-500', green: 'bg-green-500',
  yellow: 'bg-yellow-500', red: 'bg-red-500', pink: 'bg-pink-500',
  orange: 'bg-orange-500', teal: 'bg-teal-500',
}
const COLOR_RING: Record<string, string> = {
  purple: 'ring-purple-500', blue: 'ring-blue-500', green: 'ring-green-500',
  yellow: 'ring-yellow-500', red: 'ring-red-500', pink: 'ring-pink-500',
  orange: 'ring-orange-500', teal: 'ring-teal-500',
}
// Scope the visible persons to the event's explicit participant list when
// set; otherwise fall back to every Person in the system (legacy events,
// or trips where no participants were assigned upfront).
const scopedPersons = computed(() => {
  const participants = store.currentEvent?.participants ?? []
  return participants.length ? participants : personsStore.persons
})

function personById(id: string | null | undefined) {
  if (!id) return undefined
  // Look up across BOTH the scoped list AND the full persons store so the
  // payer / debt summary still resolves names if someone was removed from
  // the participants but had already claimed items.
  return scopedPersons.value.find(p => p.id === id)
    ?? personsStore.persons.find(p => p.id === id)
}
function personInitial(name: string) {
  return (name?.trim()?.[0] ?? '?').toUpperCase()
}

// ── Payer picker ────────────────────────────────────────────────────────
const payerOptions = computed(() => [
  { value: '', label: '— ' + t('upload.payerUnset') + ' —' },
  ...scopedPersons.value.map(p => ({ value: p.id, label: p.name })),
])
const payerDraft = ref(props.receipt.paidByPersonId ?? '')
watch(() => props.receipt.paidByPersonId, (v) => { payerDraft.value = v ?? '' })

async function setPayer(personId: string) {
  payerDraft.value = personId
  await store.updateLocationReceipt(props.receipt.id, { paidByPersonId: personId || null })
}

// ── Unified entries (booth products + receipt-only items) ───────────────
// `articleName` is set on price sources that live under an article-type
// catalog image, so the receipt row can clarify which figure/item the source
// belongs to — disambiguates "eEarphone · 4130 JPY" vs "eEarphone · 32800 JPY"
// when both happen to be sources from the same shop for different articles.
type EntryProduct = { kind: 'product'; id: string; name: string; price: number | null; currency: string; size: string | null; category: string | null; marks: Array<{ personId: string; quantity: number }>; boothName: string; articleName: string | null; splitAmongMarked: boolean; product: Product }
type EntryCustom = { kind: 'custom'; id: string; name: string; price: number | null; currency: string; size: null; category: null; marks: Array<{ personId: string; quantity: number }>; boothName: string; articleName: null; splitAmongMarked: boolean; item: LocationReceiptItem }
type Entry = EntryProduct | EntryCustom

const entries = computed<Entry[]>(() => {
  const loc = store.currentEvent?.locations?.find(l => l.id === props.locationId)
  if (!loc) return []
  const out: Entry[] = []
  for (const booth of loc.booths ?? []) {
    // Lookup table: catalogImageId → article display name, populated only
    // for article-type images. Catalog/receipt images are skipped because
    // their "name" wouldn't disambiguate anything useful here.
    const articleNameById = new Map<string, string>()
    for (const img of booth.images ?? []) {
      if (img.imageType !== 'article') continue
      const label = img.customName?.trim() || img.originalName?.trim() || ''
      if (label) articleNameById.set(img.id, label)
    }
    for (const product of booth.products ?? []) {
      // Receipt assignments piggyback on the per-person purchased marks.
      const marks = (product.marks ?? [])
        .filter(m => m.isPurchased)
        .map(m => ({ personId: m.personId, quantity: m.quantity ?? 1 }))
      const articleName = product.catalogImageId
        ? articleNameById.get(product.catalogImageId) ?? null
        : null
      out.push({
        kind: 'product',
        id: product.id,
        name: product.name,
        price: product.price,
        currency: product.currency,
        size: product.size,
        category: product.category,
        marks,
        boothName: booth.name,
        articleName,
        splitAmongMarked: product.splitAmongMarked === true,
        product,
      })
    }
  }
  // Ad-hoc receipt-only items live under a synthetic "Custom" group at the
  // bottom; sort key here just buckets them after every booth.
  const customLabel = t('upload.customGroupLabel')
  for (const item of props.receipt.items ?? []) {
    out.push({
      kind: 'custom',
      id: item.id,
      name: item.name,
      price: item.price,
      currency: item.currency,
      size: null,
      category: null,
      marks: item.marks.map(m => ({ personId: m.personId, quantity: m.quantity })),
      boothName: customLabel,
      articleName: null,
      splitAmongMarked: item.splitAmongMarked === true,
      item,
    })
  }
  return out.sort((a, b) => {
    const customA = a.kind === 'custom' ? 1 : 0
    const customB = b.kind === 'custom' ? 1 : 0
    if (customA !== customB) return customA - customB
    const byShop = a.boothName.localeCompare(b.boothName)
    if (byShop !== 0) return byShop
    // Group sources for the same article together so the user sees all
    // "Final Audio E3000" sources, then all "Final Audio A5000" sources.
    const articleA = a.articleName ?? '￿'
    const articleB = b.articleName ?? '￿'
    const byArticle = articleA.localeCompare(articleB)
    if (byArticle !== 0) return byArticle
    return a.name.localeCompare(b.name)
  })
})

const totalClaimed = computed(() => entries.value.filter(e => e.marks.length).length)

// ── Mark toggling ────────────────────────────────────────────────────────
async function toggleClaim(entry: Entry, personId: string) {
  if (!personId) return
  // Permission gate: anyone-for-themselves; editors can mark anyone.
  if (!canMark.value) return
  const self = viewerPersonId.value
  if (personId !== self && !props.canEdit) return

  const hasClaim = entry.marks.some(m => m.personId === personId)
  if (entry.kind === 'product') {
    // Reuse the product-marks endpoint; flip THIS person's purchased flag.
    await store.setMark(entry.product.id, { isPurchased: !hasClaim, personId })
  } else {
    await store.setReceiptItemMark(entry.item.id, personId, hasClaim ? 0 : 1)
  }
}

function isClaimedBy(entry: Entry, personId: string): boolean {
  return entry.marks.some(m => m.personId === personId)
}

// Flip the per-item "split among markers" flag. Booth products go through
// updateProduct (so the change is reflected app-wide, not just on this
// receipt); receipt-only items go through updateReceiptItem.
async function toggleSplit(entry: Entry) {
  if (!props.canEdit) return
  const next = !entry.splitAmongMarked
  if (entry.kind === 'product') {
    await store.updateProduct(entry.product.id, { splitAmongMarked: next })
  } else {
    await store.updateReceiptItem(entry.item.id, { splitAmongMarked: next })
  }
}

// ── Settlement summary ──────────────────────────────────────────────────
const debts = computed(() => {
  const loc = store.currentEvent?.locations?.find(l => l.id === props.locationId)
  if (!loc) return []
  return store.perReceiptDebts(props.receipt, loc)
})

function formatCurrencyMap(map: Record<string, number>): string {
  return Object.entries(map)
    .filter(([, amt]) => Math.abs(amt) >= 0.005)
    .map(([cur, amt]) => `${amt.toFixed(2)} ${cur}`)
    .join(' · ')
}

// Convert this receipt's per-currency debt totals to the configured display
// currency USING THE RATE AS OF THE RECEIPT'S PAYMENT DATE. That way the
// per-receipt summary stays stable even if FX rates drift after the trip —
// the converted amount reflects what was actually paid at the time.
function convertedDebtTotal(byCurrency: Record<string, number>) {
  return currencyStore.convertTotals(byCurrency, props.receipt.createdAt)
}

// ── Ad-hoc custom items ─────────────────────────────────────────────────
const CURRENCIES = ['EUR', 'USD', 'GBP', 'JPY', 'CHF', 'AUD', 'CAD', 'CNY', 'KRW']
const adding = ref(false)
const newItem = reactive({ name: '', price: null as number | null, currency: 'EUR' })

async function submitCustomItem() {
  const name = newItem.name.trim()
  if (!name) return
  adding.value = true
  try {
    await store.addReceiptItem(props.receipt.id, {
      name,
      price: newItem.price,
      currency: newItem.currency,
    })
    newItem.name = ''
    newItem.price = null
  } finally {
    adding.value = false
  }
}

async function removeCustomItem(itemId: string) {
  await store.deleteReceiptItem(itemId)
}

// ── Existing pieces ─────────────────────────────────────────────────────
async function handleDelete() {
  if (deleting.value) return
  if (!confirmingDelete.value) {
    confirmingDelete.value = true
    deleteError.value = ''
    return
  }
  deleting.value = true
  deleteError.value = ''
  try {
    await store.deleteLocationReceipt(props.receipt.id, props.locationId)
    emit('update:modelValue', false)
  } catch (e: unknown) {
    // Surface the error so the user knows the click DID register but the
    // server (or client mutation) failed. Previously this was silently
    // swallowed by Vue's default error handler.
    const msg = (e as { data?: { message?: string }; message?: string })?.data?.message
      ?? (e as { message?: string })?.message
      ?? 'Unknown error'
    deleteError.value = msg
    console.error('[LocationReceiptModal] delete failed', e)
    confirmingDelete.value = false
  } finally {
    deleting.value = false
  }
}

function formatPriceCell(price: number | null, currency: string): string {
  if (price == null) return ''
  return `${price.toFixed(2)} ${currency}`
}

function openInMaps() {
  if (typeof window === 'undefined') return
  if (props.receipt.latitude == null || props.receipt.longitude == null) return
  window.open(`https://www.google.com/maps?q=${props.receipt.latitude},${props.receipt.longitude}`, '_blank', 'noopener,noreferrer')
}

watch(() => props.modelValue, (open) => {
  if (!open) {
    confirmingDelete.value = false
    fullscreen.value = false
  }
})
</script>

<template>
  <UModal
    :model-value="modelValue"
    @update:model-value="emit('update:modelValue', $event)"
    :ui="{ width: 'sm:max-w-6xl' }"
  >
    <UCard :ui="{ body: { padding: 'p-0' } }">
      <template #header>
        <div class="flex items-center gap-2 flex-wrap">
          <UIcon name="i-heroicons-receipt-percent" class="w-5 h-5 text-green-400 shrink-0" />
          <h3 class="font-semibold text-white truncate min-w-0 flex-1">{{ displayName }}</h3>
          <UBadge :label="`${totalClaimed}/${entries.length}`" variant="soft" color="green" size="xs" class="shrink-0" />
          <UButton
            v-if="receipt.latitude != null && receipt.longitude != null"
            icon="i-heroicons-map-pin"
            variant="ghost" color="purple" size="xs"
            :title="t('upload.openInMaps')"
            @click="openInMaps"
          />
          <UButton
            v-if="canEdit"
            :icon="confirmingDelete ? 'i-heroicons-check' : 'i-heroicons-trash'"
            variant="ghost" :color="confirmingDelete ? 'red' : 'gray'"
            size="xs"
            :loading="deleting"
            :title="confirmingDelete ? t('upload.deleteReceiptConfirm') : t('common.delete')"
            @click="handleDelete"
          />
        </div>
        <p class="text-xs text-gray-500 mt-1">{{ t('upload.receiptsCheckAcrossShops') }}</p>
        <p v-if="deleteError" class="text-xs text-red-400 mt-1">{{ t('upload.uploadFailed') }}: {{ deleteError }}</p>
      </template>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-0">
        <!-- Image panel -->
        <div class="relative bg-black flex items-center justify-center min-h-[240px]">
          <img
            :src="receipt.path"
            :alt="displayName"
            class="w-full max-h-[70vh] object-contain cursor-zoom-in"
            @click="fullscreen = true"
          />
          <UButton
            icon="i-heroicons-arrows-pointing-out"
            variant="solid" color="gray" size="xs"
            class="absolute top-2 right-2 opacity-70 hover:opacity-100"
            @click="fullscreen = true"
          />
        </div>

        <!-- Checklist + settlement panel -->
        <div class="bg-gray-950 max-h-[70vh] overflow-y-auto">
          <!-- Payer picker -->
          <div class="p-4 border-b border-gray-800 flex items-center gap-2 flex-wrap">
            <span class="text-xs uppercase tracking-wider text-gray-400 shrink-0">{{ t('upload.paidBy') }}</span>
            <USelect
              v-model="payerDraft"
              :options="payerOptions"
              option-attribute="label" value-attribute="value"
              :disabled="!canEdit"
              size="xs"
              class="min-w-[160px]"
              @change="setPayer(payerDraft)"
            />
            <div v-if="personById(receipt.paidByPersonId)" class="flex items-center gap-1.5 ml-1">
              <span
                class="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                :class="COLOR_BG[personById(receipt.paidByPersonId)!.color] ?? 'bg-purple-500'"
              >{{ personInitial(personById(receipt.paidByPersonId)!.name) }}</span>
              <span class="text-xs text-gray-300">{{ personById(receipt.paidByPersonId)!.name }}</span>
            </div>
          </div>

          <!-- Checklist -->
          <div class="p-4">
            <div v-if="!entries.length" class="text-sm text-gray-500 text-center py-8">
              {{ t('upload.noShopsYet') }}
            </div>
            <div v-else class="space-y-1">
              <template v-for="(entry, i) in entries" :key="entry.id">
                <div
                  v-if="i === 0 || entries[i - 1]!.boothName !== entry.boothName"
                  class="text-xs font-medium uppercase tracking-wider px-2 pt-3 first:pt-0 pb-1"
                  :class="entry.kind === 'custom' ? 'text-orange-300' : 'text-purple-300'"
                >
                  {{ entry.boothName }}
                </div>
                <div class="group/row flex items-start gap-3 p-2 rounded-lg hover:bg-gray-900 transition-colors">
                  <div class="flex-1 min-w-0">
                    <div :class="['text-sm', entry.marks.length ? 'line-through text-gray-500' : 'text-white']">
                      {{ entry.name }}
                    </div>
                    <!-- Article name: disambiguates two sources from the same
                         shop that price different figures/items. Smaller and
                         grayer than the source name so it reads as a subtitle. -->
                    <div v-if="entry.articleName" class="text-xs text-gray-500 mt-0.5 truncate">
                      <UIcon name="i-heroicons-cube" class="w-3 h-3 inline-block -mt-0.5 mr-0.5 text-orange-400/70" />{{ entry.articleName }}
                    </div>
                    <div v-if="entry.size || entry.category" class="text-xs text-gray-500 mt-0.5">
                      <span v-if="entry.size">{{ entry.size }}</span>
                      <span v-if="entry.size && entry.category"> · </span>
                      <span v-if="entry.category">{{ entry.category }}</span>
                    </div>
                    <!-- Person chips: who claimed this item -->
                    <div v-if="scopedPersons.length" class="flex items-center gap-1 mt-1.5 flex-wrap">
                      <button
                        v-for="person in scopedPersons"
                        :key="person.id"
                        type="button"
                        :title="person.name"
                        :disabled="!canMark || (person.id !== viewerPersonId && !canEdit)"
                        class="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-all"
                        :class="[
                          isClaimedBy(entry, person.id)
                            ? `${COLOR_BG[person.color] ?? 'bg-purple-500'} text-white`
                            : 'bg-gray-800 text-gray-500 border border-gray-700 hover:border-gray-500',
                          person.id === viewerPersonId
                            ? `ring-1 ring-offset-1 ring-offset-gray-950 ${COLOR_RING[person.color] ?? 'ring-purple-500'}`
                            : '',
                          (!canMark || (person.id !== viewerPersonId && !canEdit))
                            ? 'opacity-50 cursor-not-allowed'
                            : 'cursor-pointer',
                        ]"
                        @click="toggleClaim(entry, person.id)"
                      >{{ personInitial(person.name) }}</button>
                    </div>
                  </div>
                  <div class="text-right shrink-0">
                    <div v-if="entry.price != null" class="text-xs text-gray-400 font-mono">
                      {{ formatPriceCell(entry.price, entry.currency) }}
                    </div>
                    <PriceConverted
                      v-if="entry.price != null"
                      :amount="entry.price"
                      :currency="entry.currency"
                      variant="caption"
                    />
                  </div>
                  <!-- Split toggle: divides this line evenly across markers
                       in settlement math (vs. charging each marker the full
                       price). Highlighted teal when active. Editor-only since
                       it affects everyone's debts. -->
                  <UButton
                    v-if="canEdit"
                    icon="i-heroicons-arrows-right-left"
                    variant="ghost"
                    :color="entry.splitAmongMarked ? 'teal' : 'gray'"
                    size="xs"
                    class="shrink-0"
                    :class="entry.splitAmongMarked ? 'opacity-100' : 'opacity-50 hover:opacity-100'"
                    :title="entry.splitAmongMarked ? t('upload.splitOff') : t('upload.splitOn')"
                    @click="toggleSplit(entry)"
                  />
                  <UButton
                    v-if="entry.kind === 'custom' && canEdit"
                    icon="i-heroicons-x-mark"
                    variant="ghost" color="gray" size="xs"
                    class="shrink-0 opacity-0 group-hover/row:opacity-100"
                    :title="t('common.delete')"
                    @click="removeCustomItem(entry.id)"
                  />
                </div>
              </template>
            </div>

            <!-- Add custom item -->
            <div v-if="canEdit" class="mt-4 pt-4 border-t border-gray-800 space-y-2">
              <div class="text-xs uppercase tracking-wider text-gray-400">{{ t('upload.addCustomItem') }}</div>
              <div class="grid grid-cols-[1fr_90px_80px_auto] gap-2 items-center">
                <UInput
                  v-model="newItem.name"
                  :placeholder="t('upload.customItemPlaceholder')"
                  size="xs"
                  @keyup.enter="submitCustomItem"
                />
                <UInput
                  v-model.number="newItem.price"
                  type="number" step="0.01" min="0"
                  placeholder="0.00"
                  size="xs"
                />
                <USelect
                  v-model="newItem.currency"
                  :options="CURRENCIES.map(c => ({ value: c, label: c }))"
                  option-attribute="label" value-attribute="value"
                  size="xs"
                />
                <UButton
                  icon="i-heroicons-plus"
                  color="purple"
                  size="xs"
                  :loading="adding"
                  :disabled="!newItem.name.trim()"
                  @click="submitCustomItem"
                />
              </div>
            </div>

            <!-- Settlement summary -->
            <div v-if="receipt.paidByPersonId" class="mt-4 pt-4 border-t border-gray-800">
              <div class="text-xs uppercase tracking-wider text-gray-400 mb-2">{{ t('upload.settlementForReceipt') }}</div>
              <div v-if="!debts.length" class="text-xs text-gray-500">
                {{ t('upload.settlementNoDebts') }}
              </div>
              <ul v-else class="space-y-1.5">
                <li
                  v-for="debt in debts"
                  :key="`${debt.debtorPersonId}-${debt.creditorPersonId}`"
                  class="text-xs flex items-center gap-1.5 flex-wrap"
                >
                  <span
                    v-if="personById(debt.debtorPersonId)"
                    class="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold text-white"
                    :class="COLOR_BG[personById(debt.debtorPersonId)!.color] ?? 'bg-purple-500'"
                  >{{ personInitial(personById(debt.debtorPersonId)!.name) }}</span>
                  <strong class="text-gray-200">{{ personById(debt.debtorPersonId)?.name }}</strong>
                  <span class="text-gray-500">{{ t('upload.owes') }}</span>
                  <span
                    v-if="personById(debt.creditorPersonId)"
                    class="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold text-white"
                    :class="COLOR_BG[personById(debt.creditorPersonId)!.color] ?? 'bg-purple-500'"
                  >{{ personInitial(personById(debt.creditorPersonId)!.name) }}</span>
                  <strong class="text-gray-200">{{ personById(debt.creditorPersonId)?.name }}</strong>
                  <!-- Primary amount: displayCurrency-converted at receipt
                       date. Falls back to the raw per-currency breakdown
                       while rates are still loading. -->
                  <template v-if="convertedDebtTotal(debt.byCurrency) && !convertedDebtTotal(debt.byCurrency)!.partial">
                    <span class="font-mono text-yellow-400">
                      {{ convertedDebtTotal(debt.byCurrency)!.value.toFixed(2) }} {{ convertedDebtTotal(debt.byCurrency)!.target }}
                    </span>
                    <span
                      v-if="Object.keys(debt.byCurrency).filter(c => c !== convertedDebtTotal(debt.byCurrency)!.target).length"
                      class="text-gray-500 font-mono"
                    >({{ formatCurrencyMap(debt.byCurrency) }})</span>
                  </template>
                  <span v-else class="font-mono text-yellow-400">{{ formatCurrencyMap(debt.byCurrency) }}</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </UCard>

    <!-- Fullscreen image overlay -->
    <Teleport to="body">
      <div
        v-if="fullscreen"
        class="fixed inset-0 z-[9999] bg-gray-950 flex flex-col"
        style="overscroll-behavior: none"
        @click="fullscreen = false"
      >
        <div class="flex items-center gap-2 px-3 py-3 bg-gray-900 border-b border-gray-800 shrink-0">
          <UButton icon="i-heroicons-x-mark" variant="ghost" color="gray" size="sm" @click="fullscreen = false">
            <span class="hidden sm:inline">{{ t('common.close') }}</span>
          </UButton>
          <span class="text-white font-medium text-sm truncate flex-1 min-w-0">{{ displayName }}</span>
        </div>
        <div class="flex-1 overflow-auto bg-black flex items-center justify-center" @click.stop>
          <img :src="receipt.path" :alt="displayName" class="max-w-full max-h-full object-contain" />
        </div>
      </div>
    </Teleport>
  </UModal>
</template>
