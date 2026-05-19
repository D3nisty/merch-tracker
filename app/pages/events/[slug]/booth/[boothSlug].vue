<script setup lang="ts">
import { VueDraggable } from 'vue-draggable-plus'
import { useEventsStore } from '~/stores/events'
import { useAuthStore } from '~/stores/auth'
import { usePersonsStore } from '~/stores/persons'
import { useLocale } from '~/composables/useLocale'
import type { Booth, Product, CatalogImage, BoothPreset, BoothDiscount } from '~/stores/events'

const route = useRoute()
const store = useEventsStore()
const authStore = useAuthStore()
const personsStore = usePersonsStore()
const { t } = useLocale()

if (!store.currentEvent) {
  await store.fetchEvent(route.params.slug as string)
}

const event = computed(() => store.currentEvent)
const booth = computed<Booth | undefined>(() => {
  const boothSlug = route.params.boothSlug as string
  for (const loc of event.value?.locations ?? []) {
    const found = loc.booths?.find(b => b.slug === boothSlug || b.id === boothSlug)
    if (found) return found
  }
  return undefined
})

if (!booth.value) {
  throw createError({ statusCode: 404, message: 'Booth not found' })
}

useHead({ title: () => booth.value?.name ?? 'Booth' })

// Per-booth edit permission — true when the user has event-edit OR a direct
// booth-edit share. Server stamps `canEdit` on each booth in the event
// response. Falls back to `canEdit` for legacy events that
// pre-date the per-booth flag.
const canEdit = computed(() => booth.value?.canEdit ?? canEdit)
// Only the event owner / admin can grant new booth shares.
const canManageBoothShares = computed(() => authStore.isAdmin || event.value?.ownerId === authStore.user?.id)

const showShareBoothModal = ref(false)
const showEditBoothModal = ref(false)
const showAddProduct = ref(false)
const iconInputRef = ref<HTMLInputElement | null>(null)
const iconError = ref('')

async function handleIconFile(e: Event) {
  const target = e.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file || !booth.value) return
  iconError.value = ''
  try {
    await store.uploadBoothIcon(booth.value.id, file)
  } catch (err) {
    iconError.value = (err as { data?: { message?: string } })?.data?.message ?? 'Upload failed'
  } finally {
    target.value = '' // reset so the same file can be selected again
  }
}

async function clearIcon() {
  if (!booth.value) return
  try {
    await store.updateBooth(booth.value.id, { iconPath: null })
  } catch (err) {
    iconError.value = (err as { data?: { message?: string } })?.data?.message ?? 'Failed to clear icon'
  }
}
const showUploadImage = ref(false)
const selectedImageId = ref<string | null>(null)
const showDeleteProductModal = ref(false)
const deleteProductId = ref<string | null>(null)

// Price presets
const presets = ref<BoothPreset[]>([])
const showAddPreset = ref(false)
const presetForm = reactive({ label: '', price: '' as string | number, currency: 'EUR' })
const CURRENCIES = ['EUR', 'JPY', 'USD', 'GBP', 'CHF', 'KRW']
const SIZES = ['A6', 'A5', 'A4', 'A3', 'A2', 'B2', 'B3', '90×50cm', '40×23.5cm', '25cm', '20cm', '15cm', '10cm']
const sizeOptions = computed(() => [{ value: '', label: t('booth.pickSize') }, ...SIZES.map(s => ({ value: s, label: s }))])

async function loadPresets() {
  if (!booth.value) return
  presets.value = await $fetch<BoothPreset[]>(`/api/booths/${booth.value.id}/presets`)
}

async function addPreset() {
  if (!presetForm.label.trim() || !presetForm.price || !booth.value) return
  const created = await $fetch<BoothPreset>('/api/presets', {
    method: 'POST',
    body: { boothId: booth.value.id, label: presetForm.label, price: Number(presetForm.price), currency: presetForm.currency },
  })
  presets.value.push(created)
  Object.assign(presetForm, { label: '', price: '', currency: 'EUR' })
  showAddPreset.value = false
}

async function deletePreset(id: string) {
  await $fetch(`/api/presets/${id}`, { method: 'DELETE' })
  presets.value = presets.value.filter(p => p.id !== id)
}

onMounted(loadPresets)

// ── Discounts ─────────────────────────────────────────────────────────
const DISCOUNT_CURRENCIES = ['EUR', 'JPY', 'USD', 'GBP', 'CHF', 'KRW']
const showDiscountModal = ref(false)
const editingDiscountId = ref<string | null>(null)
type DiscountFormShape = {
  label: string
  scopeType: 'size' | 'category'
  scopeValue: string
  type: 'buy_get_free' | 'bundle'
  triggerQty: number
  freeQty: number
  bundlePrice: number
  bundleCurrency: string
}
const discountForm = reactive<DiscountFormShape>({
  label: '', scopeType: 'size', scopeValue: '',
  type: 'buy_get_free',
  triggerQty: 3, freeQty: 1,
  bundlePrice: 0, bundleCurrency: 'EUR',
})
const discountSavingsLabel = computed(() => formatCostMap(boothSavings.value))

function openCreateDiscount() {
  editingDiscountId.value = null
  Object.assign(discountForm, {
    label: '', scopeType: 'size', scopeValue: '',
    type: 'buy_get_free',
    triggerQty: 3, freeQty: 1,
    bundlePrice: 0, bundleCurrency: 'EUR',
  })
  cancelAddCustomScope()
  showDiscountModal.value = true
}
function openEditDiscount(d: BoothDiscount) {
  editingDiscountId.value = d.id
  Object.assign(discountForm, {
    label: d.label, scopeType: d.scopeType, scopeValue: d.scopeValue,
    type: d.type,
    triggerQty: d.triggerQty,
    freeQty: d.freeQty ?? 1,
    bundlePrice: d.bundlePrice ?? 0,
    bundleCurrency: d.bundleCurrency ?? 'EUR',
  })
  cancelAddCustomScope()
  // If the discount's scopeValue isn't in the defaults or already used on the
  // booth (e.g. the original product was deleted), stash it as a custom entry
  // so its pill stays visible and pre-selected when the modal opens.
  if (d.scopeValue) {
    const defaults = d.scopeType === 'size' ? DEFAULT_DISCOUNT_SIZES : DEFAULT_DISCOUNT_CATS
    const used = d.scopeType === 'size' ? boothSizes.value : boothCategories.value
    if (!defaults.includes(d.scopeValue) && !used.includes(d.scopeValue)) {
      const target = d.scopeType === 'size' ? customSizes : customCategories
      if (!target.value.includes(d.scopeValue)) target.value.push(d.scopeValue)
    }
  }
  showDiscountModal.value = true
}
const discountFormValid = computed(() => {
  if (!discountForm.label.trim() || !discountForm.scopeValue.trim()) return false
  if (discountForm.triggerQty < 2) return false
  if (discountForm.type === 'buy_get_free') {
    return discountForm.freeQty >= 1 && discountForm.freeQty < discountForm.triggerQty
  }
  return discountForm.bundlePrice >= 0 && !!discountForm.bundleCurrency
})
async function saveDiscount() {
  if (!booth.value || !discountFormValid.value) return
  const payload = discountForm.type === 'buy_get_free'
    ? {
        label: discountForm.label,
        scopeType: discountForm.scopeType,
        scopeValue: discountForm.scopeValue,
        type: 'buy_get_free' as const,
        triggerQty: discountForm.triggerQty,
        freeQty: discountForm.freeQty,
      }
    : {
        label: discountForm.label,
        scopeType: discountForm.scopeType,
        scopeValue: discountForm.scopeValue,
        type: 'bundle' as const,
        triggerQty: discountForm.triggerQty,
        bundlePrice: discountForm.bundlePrice,
        bundleCurrency: discountForm.bundleCurrency,
      }
  if (editingDiscountId.value) {
    await store.updateDiscount(editingDiscountId.value, payload as Partial<BoothDiscount>)
  } else {
    await store.createDiscount(booth.value.id, payload as Omit<BoothDiscount, 'id' | 'boothId' | 'createdAt'>)
  }
  showDiscountModal.value = false
}
async function deleteDiscount(id: string) {
  if (!confirm(t('discount.confirmDelete'))) return
  await store.deleteDiscount(id)
}

// Pill-chip pickers for size + category (mirrors the Quick Add form in the
// catalog viewer). The pool is: DEFAULT_SIZES / DEFAULT_CATS  ∪  values
// already used on this booth's products  ∪  values already used on the
// booth's discounts  ∪  session-only custom additions via the "+" pill.
const DEFAULT_DISCOUNT_SIZES = ['A6', 'A5', 'A4', 'A3', 'A2', 'B2', 'B3', '90×50cm', '40×23.5cm', '25cm', '20cm', '15cm', '10cm']
const DEFAULT_DISCOUNT_CATS = ['Print', 'Keychain', 'Sticker', 'Acrylic Figure', 'Figure', 'Mousepad', 'Shirt', 'Pin', 'Plush', 'Other']
const customSizes = ref<string[]>([])
const customCategories = ref<string[]>([])

function uniqueOrdered(...lists: string[][]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const list of lists) for (const v of list) {
    if (v && !seen.has(v)) { seen.add(v); out.push(v) }
  }
  return out
}

const boothSizes = computed(() => {
  const used: string[] = []
  for (const p of booth.value?.products ?? []) if (p.size) used.push(p.size)
  for (const d of booth.value?.discounts ?? []) if (d.scopeType === 'size' && d.scopeValue) used.push(d.scopeValue)
  return used
})
const boothCategories = computed(() => {
  const used: string[] = []
  for (const p of booth.value?.products ?? []) if (p.category) used.push(p.category)
  for (const d of booth.value?.discounts ?? []) if (d.scopeType === 'category' && d.scopeValue) used.push(d.scopeValue)
  return used
})
const sizePills = computed(() => uniqueOrdered(DEFAULT_DISCOUNT_SIZES, boothSizes.value, customSizes.value))
const categoryPills = computed(() => uniqueOrdered(DEFAULT_DISCOUNT_CATS, boothCategories.value, customCategories.value))

// Inline "+" add-custom mode for the active pill row.
const addingCustomScope = ref(false)
const customScopeDraft = ref('')
function startAddCustomScope() {
  customScopeDraft.value = ''
  addingCustomScope.value = true
}
function cancelAddCustomScope() {
  addingCustomScope.value = false
  customScopeDraft.value = ''
}
function commitCustomScope() {
  const v = customScopeDraft.value.trim()
  addingCustomScope.value = false
  customScopeDraft.value = ''
  if (!v) return
  if (discountForm.scopeType === 'size') {
    if (!sizePills.value.includes(v)) customSizes.value.push(v)
  } else {
    if (!categoryPills.value.includes(v)) customCategories.value.push(v)
  }
  discountForm.scopeValue = v
}
function pickScopePill(v: string) {
  // Toggle: clicking the selected pill deselects.
  discountForm.scopeValue = discountForm.scopeValue === v ? '' : v
}

// Switching scope type cancels any half-typed custom value and clears the
// selection if it doesn't exist in the new pill list.
watch(() => discountForm.scopeType, () => {
  cancelAddCustomScope()
  const list = discountForm.scopeType === 'size' ? sizePills.value : categoryPills.value
  if (discountForm.scopeValue && !list.includes(discountForm.scopeValue)) {
    discountForm.scopeValue = ''
  }
})

function confirmDeleteProduct(id: string) {
  deleteProductId.value = id
  showDeleteProductModal.value = true
}

function formatCostMap(map: Record<string, number>) {
  const entries = Object.entries(map).filter(([, v]) => Math.abs(v) > 0.005)
  if (!entries.length) return null
  return entries.map(([cur, amt]) => `${amt.toFixed(2)} ${cur}`).join(' · ')
}

// Booth header total — filtered by the currently active "view as" person so
// each user sees THEIR own spend at this booth (no more "two accounts showing
// each other's marks added together"). If no person is selected, falls back
// to the viewer's own personId. If still unset (guests), shows the union
// across all marks.
function buildCostMap(
  products: Product[],
  images: CatalogImage[],
  paidOnly: boolean,
  personId: string | null,
) {
  const map: Record<string, number> = {}
  const matches = (m: { isPlanned: boolean; isPurchased: boolean }) =>
    paidOnly ? m.isPurchased : (m.isPlanned || m.isPurchased)
  const matchingQty = (p: Product) => {
    const marks = p.marks ?? []
    if (personId) {
      const mine = marks.find(m => m.personId === personId)
      return mine && matches(mine) ? Math.max(1, mine.quantity ?? 1) : 0
    }
    return marks.reduce((s, m) => s + (matches(m) ? Math.max(1, m.quantity ?? 1) : 0), 0)
  }
  // Article-winner pick is also per-person now: each viewer sees THEIR winning
  // source for an article. With no personId, fall back to "any mark wins".
  const articleWinners = new Map<string, string>()
  for (const img of images) {
    if (img.imageType !== 'article') continue
    const articleProducts = products.filter(q => q.catalogImageId === img.id && q.price)
    const winnerForPerson = (pid: string | null) => {
      const pickPlanned = (q: Product) => (q.marks ?? []).some(m =>
        (!pid || m.personId === pid) && m.isPlanned)
      const pickPaid = (q: Product) => (q.marks ?? []).some(m =>
        (!pid || m.personId === pid) && m.isPurchased)
      return paidOnly
        ? articleProducts.find(pickPaid)
        : (articleProducts.find(pickPlanned) ?? articleProducts.find(pickPaid))
    }
    const winner = winnerForPerson(personId)
    if (winner) articleWinners.set(img.id, winner.id)
  }
  for (const p of products) {
    if (!p.price) continue
    const qty = matchingQty(p)
    if (qty === 0) continue
    const img = images.find(i => i.id === p.catalogImageId)
    if (img?.imageType === 'article' && articleWinners.get(img.id) !== p.id) continue
    const cur = p.currency || 'EUR'
    map[cur] = (map[cur] ?? 0) + p.price * qty
  }
  return map
}

// Default the booth view to the user's OWN person (so "what does this booth
// cost me?" is the natural answer). The View-as picker on /account overrides
// via personsStore.currentPersonId.
const effectivePersonId = computed<string | null>(() =>
  personsStore.currentPersonId
    ?? store.currentEvent?.viewerPersonId
    ?? authStore.user?.personId
    ?? null,
)

// Planned is GROSS — what these items would cost at list price. Spent is
// NET — actual money handed over after the discount kicked in at the till
// (matches `getPaidCostByCurrency` semantics on the dashboard). The savings
// caption in the Discounts section below shows the gap, so the user can
// read both "you paid €252" and "you saved €20" at a glance.
const costByCurrency = computed(() =>
  buildCostMap(booth.value?.products ?? [], booth.value?.images ?? [], false, effectivePersonId.value))
const purchasedByCurrency = computed(() => {
  const raw = buildCostMap(booth.value?.products ?? [], booth.value?.images ?? [], true, effectivePersonId.value)
  const savings = booth.value ? store.getBoothSavingsByCurrency(booth.value.id, effectivePersonId.value) : {}
  const out: Record<string, number> = { ...raw }
  for (const [cur, save] of Object.entries(savings)) out[cur] = (out[cur] ?? 0) - save
  return out
})
const boothSavings = computed(() =>
  booth.value ? store.getBoothSavingsByCurrency(booth.value.id, effectivePersonId.value) : {})
// "What would buying one of everything at this booth cost?" — see the store
// helper for the article-source handling rule.
const buyEverythingByCurrency = computed(() =>
  booth.value ? store.getBoothBuyEverythingByCurrency(booth.value.id) : {})

async function handleToggle(product: Product) {
  await store.togglePurchased(product)
}

async function handleDeleteProduct() {
  if (!deleteProductId.value) return
  await store.deleteProduct(deleteProductId.value)
  showDeleteProductModal.value = false
  deleteProductId.value = null
}

const sortedImages = computed(() =>
  [...(booth.value?.images ?? [])]
    .filter(i => !i.parentId)
    .sort((a, b) => a.sortOrder - b.sortOrder),
)

const filteredImages = computed(() => {
  const pid = personsStore.currentPersonId
  if (!pid) return sortedImages.value
  return sortedImages.value.filter(img =>
    img.imageType !== 'article' || !img.personId || img.personId === pid,
  )
})

function subImagesFor(imageId: string) {
  return [...(booth.value?.images ?? [])]
    .filter(i => i.parentId === imageId)
    .sort((a, b) => a.sortOrder - b.sortOrder)
}

const groupedByImage = computed(() => {
  const groups: Record<string, Product[]> = { none: [] }
  for (const img of booth.value?.images ?? []) {
    groups[img.id] = []
  }
  for (const p of booth.value?.products ?? []) {
    const key = p.catalogImageId ?? 'none'
    if (!groups[key]) groups[key] = []
    groups[key].push(p)
  }
  return groups
})

// vuedraggable splices into the array bound via `:list`, but computeds return
// a fresh array each call so the splice would be on a throwaway. We mirror
// `filteredImages` into a real ref and let vuedraggable mutate THAT in place;
// a watcher keeps it in sync whenever the underlying data shifts (image
// added/deleted, person filter switched, etc.).
const draggableImages = ref<CatalogImage[]>([])
watch(filteredImages, (fresh) => {
  // Avoid clobbering the in-progress drag: if the IDs are already the same
  // set in the same order, leave the array alone so we don't re-render the
  // ghost element under the user's cursor.
  const sameIds =
    fresh.length === draggableImages.value.length &&
    fresh.every((img, i) => draggableImages.value[i]?.id === img.id)
  if (!sameIds) draggableImages.value = [...fresh]
}, { immediate: true })

async function onImagesDragEnd() {
  if (!booth.value) return
  // Reproject the visible drag back onto the full parent-image list. Hidden
  // (person-filtered) images keep their original slots; visible slots get
  // filled in order from `draggableImages`.
  const allParents = sortedImages.value
  const visibleIds = new Set(filteredImages.value.map(i => i.id))
  let visIdx = 0
  const newOrderedIds = allParents.map(img => {
    if (visibleIds.has(img.id)) {
      const next = draggableImages.value[visIdx]
      visIdx++
      return next?.id ?? img.id
    }
    return img.id
  })
  try {
    await store.reorderImages(booth.value.id, newOrderedIds, route.params.slug as string)
  } catch (e) {
    console.error('Failed to save image order', e)
  }
}

const COLOR_MAP: Record<string, string> = {
  purple: 'bg-purple-500', blue: 'bg-blue-500', green: 'bg-green-500',
  yellow: 'bg-yellow-500', red: 'bg-red-500', pink: 'bg-pink-500',
  orange: 'bg-orange-500', teal: 'bg-teal-500',
}

const personBreakdown = computed(() => {
  const images = booth.value?.images ?? []
  const result: Array<{ person: typeof personsStore.persons[0] | null; label: string; entries: [string, number][] }> = []
  const personMap = new Map<string | null, Record<string, number>>()

  for (const p of booth.value?.products ?? []) {
    if (!p.price) continue
    const img = images.find(i => i.id === p.catalogImageId)
    if (img?.imageType === 'article' && !p.isPurchased) continue
    const key = p.personId ?? null
    if (!personMap.has(key)) personMap.set(key, {})
    const cur = p.currency || 'EUR'
    personMap.get(key)![cur] = (personMap.get(key)![cur] ?? 0) + p.price * p.quantity
  }

  for (const [personId, map] of personMap) {
    const person = personId ? personsStore.persons.find(p => p.id === personId) ?? null : null
    result.push({
      person,
      label: person?.name ?? t('booth.unassigned'),
      entries: Object.entries(map),
    })
  }
  return result
})
</script>

<template>
  <div v-if="booth">
    <!-- Breadcrumb -->
    <div class="mb-6">
      <div class="flex items-center gap-1 text-sm text-gray-400 mb-4">
        <NuxtLink to="/" class="hover:text-white">Events</NuxtLink>
        <UIcon name="i-heroicons-chevron-right" class="w-4 h-4" />
        <NuxtLink :to="`/events/${route.params.slug}`" class="hover:text-white">{{ event?.name }}</NuxtLink>
        <UIcon name="i-heroicons-chevron-right" class="w-4 h-4" />
        <span class="text-white">{{ booth.name }}</span>
      </div>

      <div class="flex items-start justify-between gap-3 flex-wrap">
        <div class="min-w-0 flex-1 flex items-start gap-3">
          <!-- Booth icon (same image shown on the dashboard tile). Editors
               click to upload; long-press / right-click clears via the
               handler. Falls back to a generic glyph. -->
          <button
            type="button"
            class="shrink-0 w-12 h-12 rounded-lg overflow-hidden flex items-center justify-center bg-gray-800 border border-gray-700 hover:border-purple-500 transition-colors group/icon relative"
            :class="canEdit ? 'cursor-pointer' : 'cursor-default'"
            :disabled="!canEdit"
            :title="canEdit ? t('booth.uploadIcon') : ''"
            @click="canEdit && iconInputRef?.click()"
          >
            <img
              v-if="booth.iconPath"
              :src="booth.iconPath"
              alt=""
              loading="lazy"
              decoding="async"
              class="w-full h-full object-cover"
            />
            <UIcon v-else name="i-heroicons-shopping-bag" class="w-5 h-5 text-gray-500" />
            <div v-if="canEdit"
              class="absolute inset-0 bg-black/60 opacity-0 group-hover/icon:opacity-100 transition-opacity flex items-center justify-center"
            >
              <UIcon name="i-heroicons-camera" class="w-5 h-5 text-white" />
            </div>
          </button>
          <input
            ref="iconInputRef"
            type="file"
            accept="image/*"
            class="hidden"
            @change="handleIconFile"
          />
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2 flex-wrap">
              <h1 class="text-2xl font-bold text-white break-words">{{ booth.name }}</h1>
              <UButton
                v-if="canEdit"
                icon="i-heroicons-pencil-square"
                variant="ghost"
                color="gray"
                size="xs"
                :title="t('editBooth.title')"
                @click="showEditBoothModal = true"
              />
              <UButton
                v-if="canEdit && booth.iconPath"
                icon="i-heroicons-x-mark"
                variant="ghost"
                color="gray"
                size="xs"
                :title="t('booth.clearIcon')"
                @click="clearIcon"
              />
            </div>
          <div class="flex items-center gap-3 mt-1 text-gray-400 text-sm">
            <span v-if="booth.hallNr">{{ t('booth.hallLabel') }} {{ booth.hallNr }}</span>
            <span v-if="booth.boothNr">{{ t('booth.boothOf') }} {{ booth.boothNr }}</span>
            <a v-if="booth.website" :href="booth.website" target="_blank" class="text-purple-400 hover:underline">
              Website
            </a>
          </div>
          <p v-if="booth.notes" class="text-gray-500 text-sm mt-1">{{ booth.notes }}</p>
          <div v-if="booth.shopCategory" class="flex flex-wrap gap-1.5 mt-2">
            <span
              v-for="cat in booth.shopCategory.split(',')"
              :key="cat"
              class="px-2 py-0.5 rounded-full text-xs bg-gray-800 text-gray-300 border border-gray-700"
            >
              {{ cat }}
            </span>
          </div>
          </div><!-- /inner text wrap -->
        </div><!-- /icon + text flex -->
        <div v-if="canEdit" class="text-right">
          <div v-if="formatCostMap(costByCurrency)" class="font-bold text-yellow-400 leading-tight">
            <div v-for="[cur, amt] in Object.entries(costByCurrency)" :key="cur" class="text-xl">
              {{ amt.toFixed(2) }} {{ cur }}
            </div>
          </div>
          <div v-else class="text-xl font-bold text-yellow-400">—</div>
          <div class="text-sm text-gray-400 mt-0.5">
            {{ formatCostMap(purchasedByCurrency) ?? '0.00' }} {{ t('booth.spent') }}
          </div>
          <!-- Hypothetical "buy everything once" total — independent of any
               viewer's marks. Cheapest source per article + each catalog
               product at unit price. -->
          <div v-if="formatCostMap(buyEverythingByCurrency)" class="text-xs text-gray-500 mt-1">
            {{ formatCostMap(buyEverythingByCurrency) }} {{ t('booth.buyEverything') }}
          </div>
        </div>
      </div>
    </div>

    <!-- Action bar (edit mode only). "Share booth" only shows for event
         owner / admin since booth-edit-share users can't onward-share. -->
    <div v-if="canEdit || canManageBoothShares" class="flex gap-2 mb-6 flex-wrap">
      <UButton v-if="canEdit" icon="i-heroicons-plus" color="purple" @click="showAddProduct = true">{{ t('booth.addProduct') }}</UButton>
      <UButton v-if="canEdit" icon="i-heroicons-photo" variant="outline" color="gray" @click="showUploadImage = true">{{ t('booth.uploadImage') }}</UButton>
      <UButton v-if="canManageBoothShares" icon="i-heroicons-share" variant="outline" color="purple" @click="showShareBoothModal = true">{{ t('boothShare.shareBooth') }}</UButton>
    </div>

    <!-- Price presets (edit mode only) -->
    <div v-if="canEdit" class="mb-6">
      <div class="flex items-center justify-between mb-2">
        <h3 class="text-sm font-semibold text-gray-400">{{ t('booth.pricePresets') }}</h3>
        <UButton
          icon="i-heroicons-plus"
          variant="ghost"
          color="gray"
          size="xs"
          @click="showAddPreset = !showAddPreset"
        >
          {{ t('booth.addPreset') }}
        </UButton>
      </div>

      <div v-if="presets.length" class="flex flex-wrap gap-2 mb-2">
        <div
          v-for="preset in presets"
          :key="preset.id"
          class="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-800 border border-gray-700 text-xs group"
        >
          <span class="text-gray-300">{{ preset.label }}</span>
          <span class="text-yellow-400 font-medium">{{ preset.price.toFixed(2) }} {{ preset.currency }}</span>
          <button
            class="text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
            @click="deletePreset(preset.id)"
          >
            <UIcon name="i-heroicons-x-mark" class="w-3 h-3" />
          </button>
        </div>
      </div>
      <p v-else-if="!showAddPreset" class="text-xs text-gray-600">{{ t('booth.noPresetsHint') }}</p>

      <div v-if="showAddPreset" class="flex gap-2 items-end mt-2">
        <UFormGroup :label="t('booth.size')" class="w-40">
          <USelect
            v-model="presetForm.label"
            :options="sizeOptions"
            option-attribute="label"
            value-attribute="value"
            size="sm"
          />
        </UFormGroup>
        <UFormGroup :label="t('booth.price')" class="w-28">
          <UInput v-model="presetForm.price" type="number" step="0.01" min="0" placeholder="0.00" size="sm" />
        </UFormGroup>
        <UFormGroup :label="t('booth.currency')" class="w-24">
          <USelect
            v-model="presetForm.currency"
            :options="CURRENCIES.map(c => ({ value: c, label: c }))"
            option-attribute="label"
            value-attribute="value"
            size="sm"
          />
        </UFormGroup>
        <UButton color="purple" size="sm" @click="addPreset">{{ t('common.save') }}</UButton>
        <UButton variant="ghost" color="gray" size="sm" @click="showAddPreset = false">{{ t('common.cancel') }}</UButton>
      </div>
    </div>

    <!-- Discounts -->
    <div v-if="(booth.discounts?.length ?? 0) > 0 || canEdit" class="mb-6">
      <div class="flex items-center justify-between mb-2 flex-wrap gap-2">
        <h3 class="text-sm font-semibold text-gray-400 flex items-center gap-2">
          <UIcon name="i-heroicons-tag" class="w-4 h-4" />
          {{ t('discount.title') }}
          <span v-if="discountSavingsLabel" class="text-xs text-green-400 font-normal">
            − {{ discountSavingsLabel }} {{ t('discount.saved') }}
          </span>
        </h3>
        <UButton
          v-if="canEdit"
          icon="i-heroicons-plus"
          variant="ghost"
          color="gray"
          size="xs"
          @click="openCreateDiscount"
        >
          {{ t('discount.add') }}
        </UButton>
      </div>
      <div v-if="(booth.discounts?.length ?? 0) > 0" class="flex flex-wrap gap-2">
        <div
          v-for="d in booth.discounts"
          :key="d.id"
          class="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-gray-900 border border-gray-700 text-sm group"
        >
          <UIcon name="i-heroicons-tag" class="w-3.5 h-3.5 text-green-400 shrink-0" />
          <span class="text-gray-200">{{ d.label }}</span>
          <span v-if="d.type === 'bundle'" class="text-xs text-gray-500">
            ({{ t('discount.bundleSummary', { n: d.triggerQty, price: d.bundlePrice?.toFixed(2) ?? '0.00', cur: d.bundleCurrency ?? '', scope: d.scopeValue }) }})
          </span>
          <span v-else class="text-xs text-gray-500">
            ({{ t('discount.buyN', { n: d.triggerQty - (d.freeQty ?? 0) }) }} {{ d.scopeValue }} {{ t('discount.getM', { m: d.freeQty ?? 0 }) }})
          </span>
          <template v-if="canEdit">
            <button
              class="text-gray-500 hover:text-purple-400 opacity-0 group-hover:opacity-100 transition-opacity"
              :title="t('common.edit')"
              @click="openEditDiscount(d)"
            >
              <UIcon name="i-heroicons-pencil-square" class="w-3.5 h-3.5" />
            </button>
            <button
              class="text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
              :title="t('common.delete')"
              @click="deleteDiscount(d.id)"
            >
              <UIcon name="i-heroicons-trash" class="w-3.5 h-3.5" />
            </button>
          </template>
        </div>
      </div>
      <p v-else-if="canEdit" class="text-xs text-gray-600">{{ t('discount.empty') }}</p>
    </div>

    <!-- Per-person breakdown — admin-only for privacy. Regular users see only
         their own totals in the booth header (filtered via effectivePersonId);
         we don't expose what other people are buying. -->
    <div v-if="authStore.isAdmin && personBreakdown.length > 1" class="mb-6 p-4 rounded-xl bg-gray-900 border border-gray-800">
      <h3 class="text-sm font-semibold text-gray-400 mb-3">{{ t('booth.costByPerson') }}</h3>
      <div class="space-y-2">
        <div v-for="item in personBreakdown" :key="item.label" class="flex items-center justify-between text-sm">
          <div class="flex items-center gap-2">
            <span
              v-if="item.person"
              :class="['w-2.5 h-2.5 rounded-full', COLOR_MAP[item.person.color] ?? 'bg-purple-500']"
            />
            <UIcon v-else name="i-heroicons-user" class="w-3 h-3 text-gray-500" />
            <span class="text-gray-300">{{ item.label }}</span>
          </div>
          <div class="text-yellow-400 font-medium">
            <span v-for="([cur, amt], i) in item.entries" :key="cur">
              <span v-if="i > 0" class="text-gray-600"> · </span>{{ amt.toFixed(2) }} {{ cur }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Catalog images with products -->
    <div :class="['space-y-8', canEdit && sortedImages.length > 1 ? 'pl-8' : '']">
      <!-- Person filter notice -->
      <div
        v-if="personsStore.currentPersonId && filteredImages.length < sortedImages.length"
        class="flex items-center gap-2 text-xs text-gray-500 pb-2 border-b border-gray-800"
      >
        <UIcon name="i-heroicons-funnel" class="w-3.5 h-3.5" />
        {{ t('booth.showingArticlesFor') }}
        <strong class="text-gray-300">{{ personsStore.persons.find(p => p.id === personsStore.currentPersonId)?.name }}</strong>
        <span class="text-gray-600">({{ sortedImages.length - filteredImages.length }} {{ t('booth.hidden') }})</span>
      </div>

      <VueDraggable
        v-model="draggableImages"
        tag="div"
        class="space-y-8"
        handle=".image-drag-handle"
        :animation="180"
        :disabled="!canEdit || filteredImages.length < 2"
        ghost-class="opacity-40"
        drag-class="cursor-grabbing"
        @end="onImagesDragEnd"
      >
        <div v-for="img in draggableImages" :key="img.id" class="relative group/img">
          <!-- Drag handle (replaces the old chevron-up/down arrows). Only
               rendered when the user can edit and there's more than one
               image to reorder. -->
          <button
            v-if="canEdit && sortedImages.length > 1"
            type="button"
            class="image-drag-handle absolute -left-8 top-2 w-6 h-6 flex items-center justify-center rounded bg-gray-800 border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 cursor-grab active:cursor-grabbing touch-none opacity-70 hover:opacity-100 transition-opacity z-10"
            :title="t('common.drag')"
          >
            <UIcon name="i-heroicons-bars-3" class="w-3.5 h-3.5" />
          </button>
          <CatalogImageViewer
            :image="img"
            :products="groupedByImage[img.id] ?? []"
            :presets="presets"
            :booth-products="img.imageType === 'receipt' ? booth.products : undefined"
            :sub-images="img.imageType === 'article' ? subImagesFor(img.id) : undefined"
          />
        </div>
      </VueDraggable>

      <!-- Products not linked to any image -->
      <div v-if="(groupedByImage['none'] ?? []).length > 0 || booth.images?.length === 0">
        <h3 class="text-lg font-semibold text-white mb-3">
          {{ booth.images?.length ? t('booth.otherProducts') : t('booth.products') }}
        </h3>
        <div class="space-y-2">
          <ProductItem
            v-for="product in groupedByImage['none']"
            :key="product.id"
            :product="product"
            @toggle="handleToggle(product)"
            @delete="confirmDeleteProduct(product.id)"
          />
        </div>
      </div>

      <!-- Empty state -->
      <div v-if="!booth.products?.length && !booth.images?.length" class="text-center py-12 text-gray-500">
        <UIcon name="i-heroicons-shopping-bag" class="w-12 h-12 mx-auto mb-3 text-gray-600" />
        <p>{{ t('booth.noContent') }}</p>
        <p v-if="canEdit" class="text-sm mt-1">{{ t('booth.uploadHint') }}</p>
      </div>
    </div>

    <!-- Modals -->
    <AddProductModal v-model="showAddProduct" :booth-id="booth.id" />
    <UploadCatalogModal v-model="showUploadImage" :booth-id="booth.id" />

    <ShareBoothModal
      v-if="event"
      v-model="showShareBoothModal"
      :booth="booth"
      :event="event"
    />

    <EditBoothModal
      v-model="showEditBoothModal"
      :booth="booth"
    />

    <UModal v-model="showDeleteProductModal" :ui="{ width: 'sm:max-w-sm' }">
      <UCard>
        <template #header><h3 class="font-semibold text-white">{{ t('booth.deleteProduct') }}</h3></template>
        <p class="text-gray-400 text-sm">{{ t('booth.deleteProductDesc') }}</p>
        <template #footer>
          <div class="flex gap-2 justify-end">
            <UButton variant="ghost" color="gray" @click="showDeleteProductModal = false">{{ t('common.cancel') }}</UButton>
            <UButton color="red" @click="handleDeleteProduct">{{ t('common.delete') }}</UButton>
          </div>
        </template>
      </UCard>
    </UModal>

    <UModal v-model="showDiscountModal" :ui="{ width: 'sm:max-w-md' }">
      <UCard>
        <template #header>
          <h3 class="font-semibold text-white">
            {{ editingDiscountId ? t('discount.edit') : t('discount.add') }}
          </h3>
        </template>
        <div class="space-y-3">
          <UFormGroup :label="t('discount.label')">
            <UInput v-model="discountForm.label" :placeholder="t('discount.labelPlaceholder')" autofocus />
          </UFormGroup>

          <!-- Discount type picker -->
          <UFormGroup :label="t('discount.kind')">
            <div class="grid grid-cols-2 gap-2">
              <button
                type="button"
                :class="[
                  'p-2 rounded border text-left text-sm transition-colors',
                  discountForm.type === 'buy_get_free'
                    ? 'border-purple-500 bg-purple-600/20 text-white'
                    : 'border-gray-700 bg-gray-900 text-gray-400 hover:border-gray-500',
                ]"
                @click="discountForm.type = 'buy_get_free'"
              >
                <div class="font-medium">{{ t('discount.kindFree') }}</div>
                <div class="text-xs opacity-70 mt-0.5">{{ t('discount.kindFreeHint') }}</div>
              </button>
              <button
                type="button"
                :class="[
                  'p-2 rounded border text-left text-sm transition-colors',
                  discountForm.type === 'bundle'
                    ? 'border-purple-500 bg-purple-600/20 text-white'
                    : 'border-gray-700 bg-gray-900 text-gray-400 hover:border-gray-500',
                ]"
                @click="discountForm.type = 'bundle'"
              >
                <div class="font-medium">{{ t('discount.kindBundle') }}</div>
                <div class="text-xs opacity-70 mt-0.5">{{ t('discount.kindBundleHint') }}</div>
              </button>
            </div>
          </UFormGroup>

          <UFormGroup :label="t('discount.scope')">
            <USelect
              v-model="discountForm.scopeType"
              :options="[{ value: 'size', label: t('discount.byScopeSize') }, { value: 'category', label: t('discount.byScopeCategory') }]"
              option-attribute="label"
              value-attribute="value"
            />
          </UFormGroup>

          <!-- Scope value: pill-chip picker (mirrors Quick Add). Single-select
               — clicking the active pill deselects. "+" opens an inline input. -->
          <UFormGroup :label="discountForm.scopeType === 'size' ? t('discount.size') : t('discount.category')">
            <div v-if="discountForm.scopeType === 'size'" class="flex flex-wrap gap-1 items-center">
              <button
                v-for="s in sizePills" :key="s" type="button"
                class="px-2 py-1 text-xs rounded border transition-colors"
                :class="discountForm.scopeValue === s ? 'bg-purple-600 border-purple-500 text-white' : 'border-gray-700 text-gray-400 hover:border-gray-500'"
                @click="pickScopePill(s)"
              >{{ s }}</button>
              <template v-if="addingCustomScope">
                <UInput
                  v-model="customScopeDraft" :placeholder="t('catalog.addCustomSize')"
                  size="xs" class="w-24" autofocus
                  @keyup.enter="commitCustomScope" @keyup.escape="cancelAddCustomScope"
                />
                <button type="button" class="px-1 text-xs text-gray-400 hover:text-white" @click="cancelAddCustomScope">✕</button>
              </template>
              <button
                v-else type="button" :title="t('catalog.addCustomSize')"
                class="px-2 py-1 text-xs rounded border border-dashed border-gray-600 text-gray-500 hover:border-purple-500 hover:text-purple-300 transition-colors"
                @click="startAddCustomScope"
              >+</button>
            </div>
            <div v-else class="flex flex-wrap gap-1 items-center">
              <button
                v-for="c in categoryPills" :key="c" type="button"
                class="px-1.5 py-0.5 text-xs rounded border transition-colors"
                :class="discountForm.scopeValue === c ? 'bg-purple-600 border-purple-500 text-white' : 'border-gray-700 text-gray-400 hover:border-gray-500'"
                @click="pickScopePill(c)"
              >{{ c }}</button>
              <template v-if="addingCustomScope">
                <UInput
                  v-model="customScopeDraft" :placeholder="t('catalog.addCustomCategory')"
                  size="xs" class="w-28" autofocus
                  @keyup.enter="commitCustomScope" @keyup.escape="cancelAddCustomScope"
                />
                <button type="button" class="px-1 text-xs text-gray-400 hover:text-white" @click="cancelAddCustomScope">✕</button>
              </template>
              <button
                v-else type="button" :title="t('catalog.addCustomCategory')"
                class="px-1.5 py-0.5 text-xs rounded border border-dashed border-gray-600 text-gray-500 hover:border-purple-500 hover:text-purple-300 transition-colors"
                @click="startAddCustomScope"
              >+</button>
            </div>
          </UFormGroup>

          <!-- buy_get_free fields -->
          <div v-if="discountForm.type === 'buy_get_free'" class="grid grid-cols-2 gap-3">
            <UFormGroup :label="t('discount.triggerQty')" :help="t('discount.triggerHelp')">
              <UInput v-model.number="discountForm.triggerQty" type="number" min="2" max="20" />
            </UFormGroup>
            <UFormGroup :label="t('discount.freeQty')" :help="t('discount.freeHelp')">
              <UInput v-model.number="discountForm.freeQty" type="number" min="1" :max="discountForm.triggerQty - 1" />
            </UFormGroup>
          </div>

          <!-- bundle fields -->
          <div v-else class="grid grid-cols-3 gap-3">
            <UFormGroup :label="t('discount.bundleTriggerQty')" :help="t('discount.bundleTriggerHelp')">
              <UInput v-model.number="discountForm.triggerQty" type="number" min="2" max="20" />
            </UFormGroup>
            <UFormGroup :label="t('discount.bundlePrice')" :help="t('discount.bundlePriceHelp')">
              <UInput v-model.number="discountForm.bundlePrice" type="number" step="0.01" min="0" />
            </UFormGroup>
            <UFormGroup :label="t('discount.currency')">
              <USelect
                v-model="discountForm.bundleCurrency"
                :options="DISCOUNT_CURRENCIES.map(c => ({ value: c, label: c }))"
                option-attribute="label"
                value-attribute="value"
              />
            </UFormGroup>
          </div>

          <div class="text-xs text-gray-400 px-2 py-1.5 rounded bg-gray-900/60 border border-gray-800">
            <UIcon name="i-heroicons-information-circle" class="w-3.5 h-3.5 inline mr-1" />
            <span v-if="discountForm.type === 'buy_get_free'">
              {{ t('discount.previewLine', {
                  pay: Math.max(0, discountForm.triggerQty - discountForm.freeQty),
                  trigger: discountForm.triggerQty,
                  free: discountForm.freeQty,
                  scope: discountForm.scopeValue || (discountForm.scopeType === 'size' ? t('discount.size') : t('discount.category')),
                }) }}
            </span>
            <span v-else>
              {{ t('discount.bundlePreviewLine', {
                  trigger: discountForm.triggerQty,
                  price: Number(discountForm.bundlePrice || 0).toFixed(2),
                  cur: discountForm.bundleCurrency,
                  scope: discountForm.scopeValue || (discountForm.scopeType === 'size' ? t('discount.size') : t('discount.category')),
                }) }}
            </span>
          </div>
        </div>
        <template #footer>
          <div class="flex gap-2 justify-end">
            <UButton variant="ghost" color="gray" @click="showDiscountModal = false">{{ t('common.cancel') }}</UButton>
            <UButton
              color="purple"
              :disabled="!discountFormValid"
              @click="saveDiscount"
            >
              {{ t('common.save') }}
            </UButton>
          </div>
        </template>
      </UCard>
    </UModal>
  </div>
</template>
