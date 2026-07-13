<script setup lang="ts">
import { VueDraggable } from 'vue-draggable-plus'
import { useEventsStore } from '~/stores/events'
import { useAuthStore } from '~/stores/auth'
import { usePersonsStore } from '~/stores/persons'
import { useCurrencyStore } from '~/stores/currency'
import { useLocale } from '~/composables/useLocale'
import type { Booth, Product, CatalogImage, BoothPreset, BoothDiscount } from '~/stores/events'

const route = useRoute()
const store = useEventsStore()
const authStore = useAuthStore()
const personsStore = usePersonsStore()
const currencyStore = useCurrencyStore()
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

// Convention context drives the indigo accent variant in the header/icon.
const isConv = computed(() => event.value?.type === 'convention')

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

// ── Products list toolbar (Nomad "scroll-hunt fix") ────────────────────
// Search + state filter + sort combine over the products NOT tied to a
// catalog image (the flat product list); results group under sticky
// category sub-headers.
const productSearch = ref('')
const productFilter = ref<'all' | 'planned' | 'bought' | 'must'>('all')
const productSort = ref<'priority' | 'name' | 'price'>('priority')
const showSortMenu = ref(false)

const standaloneProducts = computed<Product[]>(() => groupedByImage.value['none'] ?? [])

const filterCounts = computed(() => {
  const list = standaloneProducts.value
  return {
    all: list.length,
    planned: list.filter(p => p.isPlanned).length,
    bought: list.filter(p => p.isPurchased).length,
    must: list.filter(p => p.priority === 2).length,
  }
})

const filteredProducts = computed(() => {
  const q = productSearch.value.trim().toLowerCase()
  const list = standaloneProducts.value.filter((p) => {
    if (productFilter.value === 'planned' && !p.isPlanned) return false
    if (productFilter.value === 'bought' && !p.isPurchased) return false
    if (productFilter.value === 'must' && p.priority !== 2) return false
    if (q && !(`${p.name} ${p.category ?? ''} ${p.size ?? ''} ${p.description ?? ''}`.toLowerCase().includes(q))) return false
    return true
  })
  return [...list].sort((a, b) => {
    if (productSort.value === 'name') return a.name.localeCompare(b.name)
    if (productSort.value === 'price') return (b.price ?? 0) - (a.price ?? 0)
    return (b.priority ?? 0) - (a.priority ?? 0)
  })
})

// Group the filtered list by category with a per-group summed total.
const productGroups = computed(() => {
  const groups = new Map<string, Product[]>()
  for (const p of filteredProducts.value) {
    const key = p.category?.trim() || t('plist.uncategorized')
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(p)
  }
  return Array.from(groups.entries()).map(([label, items]) => {
    const byCur: Record<string, number> = {}
    for (const p of items) {
      if (!p.price) continue
      byCur[p.currency] = (byCur[p.currency] ?? 0) + p.price * (p.quantity ?? 1)
    }
    const top = Object.entries(byCur).sort((a, b) => b[1] - a[1])[0]
    return { label, items, total: top ? `${top[1].toFixed(0)} ${top[0]}` : null }
  })
})

const sortLabel = computed(() => ({
  priority: t('plist.priority'), name: t('plist.name'), price: t('plist.price'),
}[productSort.value]))

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

// Cross-currency rollup into the configured display currency. Null when
// only one currency is in use or rates haven't loaded yet for one of them.
const costConvertedTotal = computed(() => currencyStore.convertTotals(costByCurrency.value))
const paidConvertedTotal = computed(() => currencyStore.convertTotals(purchasedByCurrency.value))

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

// "What WOULD be visible if the person filter is on." Kept as its own
// computed so we can still report the hidden-articles count even after the
// user toggles `showAllArticles` to override the filter.
const mineOnlyImages = computed(() => {
  const pid = personsStore.currentPersonId
  if (!pid) return sortedImages.value
  return sortedImages.value.filter(img =>
    img.imageType !== 'article' || !img.personId || img.personId === pid,
  )
})

// Per-session override: when true, the page shows every article regardless
// of who it's assigned to. Off by default so the default landing experience
// remains "my budget, my articles". State is intentionally NOT persisted —
// each booth visit starts fresh.
const showAllArticles = ref(false)
// Parent-driven expand/collapse hint for every CatalogImageViewer. Flipping
// this nudges every child's local `expanded` ref so the user can fold the
// whole list to a compact stack before drag-reordering — much less scrolling
// than trying to push a 1000px catalog past another. Local chevron taps
// after the sweep still work normally; the next sweep just re-syncs.
const allExpanded = ref(true)
// Auto-collapse on drag, then restore to whatever the user had before the
// drag started. If they were already collapsed, the restore is a no-op.
const preDragExpanded = ref<boolean | null>(null)
function onImagesDragStart() {
  preDragExpanded.value = allExpanded.value
  allExpanded.value = false
}
const filteredImages = computed(() =>
  showAllArticles.value ? sortedImages.value : mineOnlyImages.value,
)
const hiddenArticleCount = computed(() => sortedImages.value.length - mineOnlyImages.value.length)

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

// ── Tabs: Products · Article gallery · Receipt mode ────────────────────
type BoothTab = 'products' | 'articles' | 'receipt'
const activeTab = ref<BoothTab>('products')

// Partition the (person-filtered) images by type. The Products tab shows
// catalog pages, the Article gallery shows article images (as compare cards),
// Receipt mode shows receipt images.
const productTabImages = computed(() => filteredImages.value.filter(i => i.imageType !== 'article' && i.imageType !== 'receipt'))
const articleTabImages = computed(() => filteredImages.value.filter(i => i.imageType === 'article'))
const receiptTabImages = computed(() => sortedImages.value.filter(i => i.imageType === 'receipt'))

// Products count = every product NOT belonging to an article image.
const productCount = computed(() => {
  const imgs = booth.value?.images ?? []
  return (booth.value?.products ?? []).filter((p) => {
    const img = imgs.find(i => i.id === p.catalogImageId)
    return img?.imageType !== 'article'
  }).length
})

const canMark = computed(() => authStore.isLoggedIn && !!store.currentEvent?.viewerPersonId)

const tabs = computed(() => [
  // Products tab = plain-text list: standalone products + articles (grouped).
  { key: 'products' as const, label: t('booth.tabProducts'), count: standaloneProducts.value.length + articleTabImages.value.length },
  // Article gallery = everything image-backed (article compare cards + catalog pages).
  { key: 'articles' as const, label: t('booth.tabArticles'), count: articleTabImages.value.length + productTabImages.value.length },
  { key: 'receipt' as const, label: t('booth.tabReceipt'), count: receiptTabImages.value.length },
])

// Add-action label for the floating button, per active tab.
const addLabel = computed(() => activeTab.value === 'articles' ? t('booth.newArticle') : t('booth.addProduct'))
function onFabAdd() {
  if (activeTab.value === 'articles') showUploadImage.value = true
  else showAddProduct.value = true
}

// Mobile bottom-bar FAB → adds a product / new article on this booth (editors).
const { setFab, clearFab } = useMobileFab()
onMounted(() => { if (canEdit.value) setFab({ label: t('booth.addProduct'), icon: 'i-heroicons-plus', run: onFabAdd }) })
onBeforeUnmount(clearFab)

// Article gallery cards — each article image + its price sources, cheapest
// wins, savings vs. average. `isPurchased`/`isPlanned` on each source are the
// VIEWER's own marks (server-substituted), so each viewer sees their winner.
const articleCards = computed(() =>
  articleTabImages.value.map((img) => {
    const sources = (groupedByImage.value[img.id] ?? [])
    const priced = sources.filter(s => s.price != null && s.price > 0)
      .slice().sort((a, b) => (a.price! - b.price!))
    const best = priced[0] ?? null
    const avg = priced.length ? priced.reduce((s, p) => s + p.price!, 0) / priced.length : 0
    const saved = best && priced.length > 1 ? avg - best.price! : 0
    return {
      img,
      sources,
      best,
      saved,
      currency: best?.currency ?? sources[0]?.currency ?? 'EUR',
      anyPurchased: sources.some(s => s.isPurchased),
      anyPlanned: sources.some(s => s.isPlanned),
      anyMust: sources.some(s => s.priority === 2),
    }
  }),
)

// Mark a source paid/planned with the "only one source at a time (per viewer)"
// rule — mirrors CatalogImageViewer's markAsPaid/markAsPlanned.
async function toggleArticlePaid(sources: Product[], source: Product) {
  if (!canMark.value) return
  if (source.isPurchased) { await store.setMark(source.id, { isPurchased: false }); return }
  const current = sources.find(p => p.isPurchased && p.id !== source.id)
  if (current) await store.setMark(current.id, { isPurchased: false })
  await store.setMark(source.id, { isPurchased: true })
}
async function toggleArticlePlanned(sources: Product[], source: Product) {
  if (!canMark.value) return
  if (source.isPlanned) { await store.setMark(source.id, { isPlanned: false }); return }
  const current = sources.find(p => p.isPlanned && p.id !== source.id)
  if (current) await store.setMark(current.id, { isPlanned: false })
  await store.setMark(source.id, { isPlanned: true })
}

// Articles ALSO surface in the Products (text) list — one group per article,
// header = article name, its price sources as rows below. Search + state
// filter apply the same way as for plain products.
const articleGroups = computed(() => {
  const q = productSearch.value.trim().toLowerCase()
  const out: { articleId: string; label: string; items: Product[]; all: Product[]; best: Product | null; currency: string }[] = []
  for (const img of articleTabImages.value) {
    const name = img.customName || img.originalName || t('catalog.article')
    const all = groupedByImage.value[img.id] ?? []
    const nameMatches = !q || name.toLowerCase().includes(q)
    let items = all.filter((s) => {
      if (productFilter.value === 'planned' && !s.isPlanned) return false
      if (productFilter.value === 'bought' && !s.isPurchased) return false
      if (productFilter.value === 'must' && s.priority !== 2) return false
      if (q && !nameMatches && !(`${s.name} ${s.category ?? ''}`.toLowerCase().includes(q))) return false
      return true
    })
    // Filter=all + (no query or the article name itself matches): show all sources.
    if (!items.length) {
      if (productFilter.value !== 'all' || (q && !nameMatches)) continue
      items = all
    }
    const priced = all.filter(s => s.price != null).slice().sort((a, b) => (a.price! - b.price!))
    const best = priced[0] ?? null
    out.push({ articleId: img.id, label: name, items, all, best, currency: best?.currency ?? all[0]?.currency ?? 'EUR' })
  }
  return out
})

// Article gallery cards are collapsible; jumping from the Products list opens
// the gallery, expands the target card, and scrolls to it.
const collapsedArticles = ref<Record<string, boolean>>({})
function toggleArticleCollapse(id: string) {
  collapsedArticles.value[id] = !collapsedArticles.value[id]
}
async function jumpToArticle(id: string) {
  activeTab.value = 'articles'
  collapsedArticles.value[id] = false
  await nextTick()
  document.getElementById(`article-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

// vuedraggable splices into the array bound via `:list`, but computeds return
// a fresh array each call so the splice would be on a throwaway. We mirror
// the Products-tab image list into a real ref and let vuedraggable mutate THAT
// in place; a watcher keeps it in sync when the underlying data shifts.
const draggableImages = ref<CatalogImage[]>([])
watch(productTabImages, (fresh) => {
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
  const visibleIds = new Set(productTabImages.value.map(i => i.id))
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
  } finally {
    // Restore the pre-drag expanded state. If the user was already in
    // collapse-all mode, this is a no-op; if they had everything expanded,
    // it re-expands now that they can see what landed where.
    if (preDragExpanded.value !== null) {
      allExpanded.value = preDragExpanded.value
      preDragExpanded.value = null
    }
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
      <div class="flex items-center gap-1.5 text-[12.5px] text-muted mb-3 flex-wrap">
        <NuxtLink to="/" class="hover:text-ink">{{ t('event.allEvents') }}</NuxtLink>
        <span class="text-faint-2">›</span>
        <NuxtLink :to="`/events/${route.params.slug}`" :class="isConv ? 'text-conv-soft hover:text-conv' : 'text-sky hover:text-sky-soft'">{{ event?.name }}</NuxtLink>
        <span class="text-faint-2">›</span>
        <span class="text-ink">{{ booth.name }}</span>
        <template v-if="booth.boothNr"><span class="text-faint-2">·</span><span class="text-muted">{{ booth.boothNr }}</span></template>
      </div>

      <div class="flex items-start justify-between gap-4 flex-wrap">
        <div class="min-w-0 flex-1 flex items-start gap-3.5">
          <!-- Booth icon — editors click to upload; falls back to a glyph. -->
          <button
            type="button"
            class="shrink-0 w-[46px] h-[46px] rounded-[12px] overflow-hidden flex items-center justify-center transition-colors group/icon relative"
            :class="[isConv ? 'cover-conv' : 'cover-travel', canEdit ? 'cursor-pointer hover:opacity-90' : 'cursor-default']"
            :disabled="!canEdit"
            :title="canEdit ? t('booth.uploadIcon') : ''"
            @click="canEdit && iconInputRef?.click()"
          >
            <img v-if="booth.iconPath" :src="booth.iconPath" alt="" loading="lazy" decoding="async" class="w-full h-full object-cover" />
            <UIcon v-else name="i-heroicons-shopping-bag" class="w-5 h-5" :class="isConv ? 'text-conv-soft' : 'text-sky-soft'" />
            <div v-if="canEdit" class="absolute inset-0 bg-app/60 opacity-0 group-hover/icon:opacity-100 transition-opacity flex items-center justify-center">
              <UIcon name="i-heroicons-camera" class="w-5 h-5 text-ink" />
            </div>
          </button>
          <input ref="iconInputRef" type="file" accept="image/*" class="hidden" @change="handleIconFile" />
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2 flex-wrap">
              <h1 class="text-[20px] font-bold text-ink-strong break-words">{{ booth.name }}</h1>
              <button v-if="canEdit" class="text-faint hover:text-ink" :title="t('editBooth.title')" @click="showEditBoothModal = true">
                <UIcon name="i-heroicons-pencil-square" class="w-4 h-4" />
              </button>
              <button v-if="canEdit && booth.iconPath" class="text-faint hover:text-ink" :title="t('booth.clearIcon')" @click="clearIcon">
                <UIcon name="i-heroicons-x-mark" class="w-4 h-4" />
              </button>
            </div>
            <div class="flex items-center gap-3 mt-1 text-muted text-[12.5px]">
              <span v-if="booth.hallNr">{{ t('booth.hallLabel') }} {{ booth.hallNr }}</span>
              <span v-if="booth.boothNr">{{ t('booth.boothOf') }} {{ booth.boothNr }}</span>
              <a v-if="booth.website" :href="booth.website" target="_blank" class="text-sky hover:underline">Website</a>
            </div>
            <p v-if="booth.notes" class="text-faint text-[12.5px] mt-1">{{ booth.notes }}</p>
            <div v-if="booth.shopCategory" class="flex flex-wrap gap-1.5 mt-2">
              <span v-for="cat in booth.shopCategory.split(',')" :key="cat" class="text-[10.5px] text-sky-soft bg-chip-sky px-2 py-0.5 rounded-md">{{ cat }}</span>
            </div>
          </div>
        </div>
        <!-- Planned | Spent | Buy all summary -->
        <div v-if="canEdit" class="flex items-center gap-4 shrink-0">
          <div class="text-right">
            <div class="text-[9.5px] uppercase tracking-[0.05em] text-faint">{{ t('booth.planned') }}</div>
            <div class="mono text-[17px] font-semibold text-planned">{{ formatCostMap(costByCurrency) ?? '—' }}</div>
            <div v-if="costConvertedTotal && Object.keys(costByCurrency).length > 1" class="text-[10px] text-faint mono">≈ {{ costConvertedTotal.value.toFixed(0) }} {{ costConvertedTotal.target }}</div>
          </div>
          <div class="w-px h-8 bg-line" />
          <div class="text-right">
            <div class="text-[9.5px] uppercase tracking-[0.05em] text-faint">{{ t('booth.spent') }}</div>
            <div class="mono text-[17px] font-semibold text-bought">{{ formatCostMap(purchasedByCurrency) ?? '0' }}</div>
            <div v-if="paidConvertedTotal && Object.keys(purchasedByCurrency).length > 1" class="text-[10px] text-faint mono">≈ {{ paidConvertedTotal.value.toFixed(0) }} {{ paidConvertedTotal.target }}</div>
          </div>
          <template v-if="formatCostMap(buyEverythingByCurrency)">
            <div class="w-px h-8 bg-line" />
            <div class="text-right">
              <div class="text-[9.5px] uppercase tracking-[0.05em] text-faint">{{ t('booth.buyEverything') }}</div>
              <div class="mono text-[17px] font-semibold text-muted">{{ formatCostMap(buyEverythingByCurrency) }}</div>
            </div>
          </template>
        </div>
      </div>
    </div>

    <!-- Tabs: Products · Article gallery · Receipt mode -->
    <div class="flex items-center gap-6 border-b border-line-soft mb-6">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        type="button"
        class="relative py-2.5 text-[13px] font-semibold transition-colors"
        :class="activeTab === tab.key ? 'text-ink-strong' : 'text-muted hover:text-ink'"
        @click="activeTab = tab.key"
      >
        {{ tab.label }}
        <span v-if="tab.count" class="text-faint font-medium ml-0.5">{{ tab.count }}</span>
        <span
          v-if="activeTab === tab.key"
          class="absolute -bottom-px left-0 right-0 h-0.5 rounded-full"
          :class="isConv ? 'bg-conv' : 'bg-sky'"
        />
      </button>
    </div>

    <!-- ═══════════════ PRODUCTS TAB ═══════════════ -->
    <div v-show="activeTab === 'products'">
    <!-- Action bar: booth-wide "Share booth" (owner/admin). Add product /
         upload image are the floating action button (see FAB below). -->
    <div v-if="canManageBoothShares" class="flex gap-2 mb-6 flex-wrap">
      <button class="flex items-center gap-1.5 px-4 py-2.5 rounded-field border border-line-focus text-sky-soft hover:bg-chip-sky/50 text-[13px] font-semibold transition-colors" @click="showShareBoothModal = true">
        <UIcon name="i-heroicons-share" class="w-4 h-4" /> {{ t('boothShare.shareBooth') }}
      </button>
    </div>

    <!-- Price presets (edit mode only) -->
    <div v-if="canEdit" class="mb-6">
      <div class="flex items-center justify-between mb-2">
        <h3 class="text-[11px] font-bold uppercase tracking-[0.08em] text-faint">{{ t('booth.pricePresets') }}</h3>
        <button class="flex items-center gap-1 text-xs text-muted hover:text-ink" @click="showAddPreset = !showAddPreset">
          <UIcon name="i-heroicons-plus" class="w-3.5 h-3.5" /> {{ t('booth.addPreset') }}
        </button>
      </div>

      <div v-if="presets.length" class="flex flex-wrap gap-2 mb-2">
        <div
          v-for="preset in presets"
          :key="preset.id"
          class="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-2 border border-line text-xs group"
        >
          <span class="text-muted">{{ preset.label }}</span>
          <span class="text-planned font-medium mono">{{ preset.price.toFixed(2) }} {{ preset.currency }}</span>
          <button
            class="text-faint hover:text-must opacity-0 group-hover:opacity-100 transition-opacity"
            @click="deletePreset(preset.id)"
          >
            <UIcon name="i-heroicons-x-mark" class="w-3 h-3" />
          </button>
        </div>
      </div>
      <p v-else-if="!showAddPreset" class="text-xs text-faint">{{ t('booth.noPresetsHint') }}</p>

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
        <UButton color="primary" size="sm" @click="addPreset">{{ t('common.save') }}</UButton>
        <UButton variant="ghost" color="gray" size="sm" @click="showAddPreset = false">{{ t('common.cancel') }}</UButton>
      </div>
    </div>

    <!-- Discounts -->
    <div v-if="(booth.discounts?.length ?? 0) > 0 || canEdit" class="mb-6">
      <div class="flex items-center justify-between mb-2 flex-wrap gap-2">
        <h3 class="text-[11px] font-bold uppercase tracking-[0.08em] text-faint flex items-center gap-2">
          <UIcon name="i-heroicons-tag" class="w-3.5 h-3.5" />
          {{ t('discount.title') }}
          <span v-if="discountSavingsLabel" class="text-bought font-normal normal-case tracking-normal">
            − {{ discountSavingsLabel }} {{ t('discount.saved') }}
          </span>
        </h3>
        <button v-if="canEdit" class="flex items-center gap-1 text-xs text-muted hover:text-ink" @click="openCreateDiscount">
          <UIcon name="i-heroicons-plus" class="w-3.5 h-3.5" /> {{ t('discount.add') }}
        </button>
      </div>
      <div v-if="(booth.discounts?.length ?? 0) > 0" class="flex flex-wrap gap-2">
        <div
          v-for="d in booth.discounts"
          :key="d.id"
          class="flex items-center gap-2 px-2.5 py-1.5 rounded-field bg-surface-2 border border-line text-sm group"
        >
          <UIcon name="i-heroicons-tag" class="w-3.5 h-3.5 text-bought shrink-0" />
          <span class="text-ink">{{ d.label }}</span>
          <span v-if="d.type === 'bundle'" class="text-xs text-faint">
            ({{ t('discount.bundleSummary', { n: d.triggerQty, price: d.bundlePrice?.toFixed(2) ?? '0.00', cur: d.bundleCurrency ?? '', scope: d.scopeValue }) }})
          </span>
          <span v-else class="text-xs text-faint">
            ({{ t('discount.buyN', { n: d.triggerQty - (d.freeQty ?? 0) }) }} {{ d.scopeValue }} {{ t('discount.getM', { m: d.freeQty ?? 0 }) }})
          </span>
          <template v-if="canEdit">
            <button
              class="text-faint hover:text-sky opacity-0 group-hover:opacity-100 transition-opacity"
              :title="t('common.edit')"
              @click="openEditDiscount(d)"
            >
              <UIcon name="i-heroicons-pencil-square" class="w-3.5 h-3.5" />
            </button>
            <button
              class="text-faint hover:text-must opacity-0 group-hover:opacity-100 transition-opacity"
              :title="t('common.delete')"
              @click="deleteDiscount(d.id)"
            >
              <UIcon name="i-heroicons-trash" class="w-3.5 h-3.5" />
            </button>
          </template>
        </div>
      </div>
      <p v-else-if="canEdit" class="text-xs text-faint">{{ t('discount.empty') }}</p>
    </div>

    <!-- Per-person breakdown — admin-only for privacy. Regular users see only
         their own totals in the booth header (filtered via effectivePersonId);
         we don't expose what other people are buying. -->
    <div v-if="authStore.isAdmin && personBreakdown.length > 1" class="mb-6 p-4 rounded-card bg-surface border border-line">
      <h3 class="text-[11px] font-bold uppercase tracking-[0.08em] text-faint mb-3">{{ t('booth.costByPerson') }}</h3>
      <div class="space-y-2">
        <div v-for="item in personBreakdown" :key="item.label" class="flex items-center justify-between text-sm">
          <div class="flex items-center gap-2">
            <span
              v-if="item.person"
              :class="['w-2.5 h-2.5 rounded-full', COLOR_MAP[item.person.color] ?? 'bg-sky']"
            />
            <UIcon v-else name="i-heroicons-user" class="w-3 h-3 text-faint" />
            <span class="text-ink">{{ item.label }}</span>
          </div>
          <div class="text-planned font-medium mono">
            <span v-for="([cur, amt], i) in item.entries" :key="cur">
              <span v-if="i > 0" class="text-faint-2"> · </span>{{ amt.toFixed(2) }} {{ cur }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Products list — plain text, no images (image-backed items live in the
         Article gallery). Search + filter chips + sort + category grouping. -->
    <div>
      <div v-if="standaloneProducts.length || articleGroups.length">
        <div class="rounded-window border border-line bg-surface overflow-hidden">
          <!-- sticky toolbar -->
          <div class="px-4 py-3 border-b border-line-soft bg-sidebar flex items-center gap-2.5 flex-wrap">
            <div class="flex items-center gap-2 px-3 py-2 rounded-field border border-line bg-surface-2 flex-1 min-w-[180px] focus-within:border-line-focus transition-colors">
              <UIcon name="i-heroicons-magnifying-glass" class="w-4 h-4 text-faint shrink-0" />
              <input v-model="productSearch" type="text" :placeholder="t('plist.search')" class="w-full bg-transparent text-[13px] text-ink placeholder:text-faint outline-none border-0 p-0 focus:ring-0" />
            </div>
            <div class="flex gap-1 p-1 rounded-field bg-surface-2 border border-line">
              <button class="px-3 py-1.5 rounded-[7px] text-xs transition-colors" :class="productFilter === 'all' ? 'bg-sky text-on-accent font-bold' : 'text-muted hover:text-ink font-medium'" @click="productFilter = 'all'">{{ t('plist.all') }} <span class="opacity-70">{{ filterCounts.all }}</span></button>
              <button class="px-3 py-1.5 rounded-[7px] text-xs font-medium transition-colors" :class="productFilter === 'planned' ? 'bg-chip-planned text-planned' : 'text-planned/80 hover:text-planned'" @click="productFilter = 'planned'">{{ t('plist.planned') }} {{ filterCounts.planned }}</button>
              <button class="px-3 py-1.5 rounded-[7px] text-xs font-medium transition-colors" :class="productFilter === 'bought' ? 'bg-chip-bought text-bought' : 'text-bought/80 hover:text-bought'" @click="productFilter = 'bought'">{{ t('plist.bought') }} {{ filterCounts.bought }}</button>
              <button class="px-3 py-1.5 rounded-[7px] text-xs font-medium transition-colors" :class="productFilter === 'must' ? 'bg-chip-must text-must' : 'text-must/80 hover:text-must'" @click="productFilter = 'must'">{{ t('plist.must') }} {{ filterCounts.must }}</button>
            </div>
            <div class="relative">
              <button class="flex items-center gap-1.5 px-3 py-2 rounded-field border border-line text-muted hover:text-ink text-xs transition-colors" @click="showSortMenu = !showSortMenu">
                {{ t('plist.sort') }}: {{ sortLabel }} <UIcon name="i-heroicons-chevron-down" class="w-3 h-3" />
              </button>
              <div v-if="showSortMenu" class="absolute right-0 top-full mt-1 w-36 bg-surface border border-line rounded-card shadow-pop p-1 z-20">
                <button v-for="opt in (['priority','name','price'] as const)" :key="opt" class="w-full text-left px-2.5 py-1.5 rounded-[7px] text-xs text-muted hover:bg-surface-2 hover:text-ink" :class="productSort === opt ? 'text-sky' : ''" @click="productSort = opt; showSortMenu = false">{{ t(`plist.${opt}`) }}</button>
              </div>
            </div>
          </div>

          <!-- grouped list -->
          <div>
            <template v-for="grp in productGroups" :key="grp.label">
              <div class="sticky top-0 z-10 flex items-center justify-between px-4 py-2.5 bg-surface-2 border-y border-line-soft">
                <span class="font-display text-[11.5px] font-bold uppercase tracking-[0.08em] text-sky-soft">{{ grp.label }}</span>
                <span class="mono text-[10.5px] text-faint">{{ grp.items.length }}<template v-if="grp.total"> · {{ grp.total }}</template></span>
              </div>
              <div class="px-3">
                <ProductItem
                  v-for="product in grp.items"
                  :key="product.id"
                  :product="product"
                  @toggle="handleToggle(product)"
                  @delete="confirmDeleteProduct(product.id)"
                />
              </div>
            </template>

            <!-- Article groups: header = article name (jumps to gallery), price sources below -->
            <template v-for="grp in articleGroups" :key="grp.articleId">
              <div class="sticky top-0 z-10 flex items-center justify-between gap-2 px-4 py-2.5 bg-surface-2 border-y border-line-soft">
                <button type="button" class="flex items-center gap-1.5 min-w-0 group/aj" :title="t('booth.jumpToGallery')" @click="jumpToArticle(grp.articleId)">
                  <UIcon name="i-heroicons-photo" class="w-3 h-3 text-sky-soft shrink-0" />
                  <span class="font-display text-[11.5px] font-bold uppercase tracking-[0.08em] text-sky-soft truncate">{{ grp.label }}</span>
                  <UIcon name="i-heroicons-arrow-top-right-on-square" class="w-3 h-3 text-faint group-hover/aj:text-sky shrink-0" />
                </button>
                <span class="mono text-[10.5px] text-faint shrink-0">{{ grp.items.length }}<template v-if="grp.best"> · {{ t('booth.articleBest') }} {{ (grp.best.price ?? 0).toFixed(0) }} {{ grp.currency }}</template></span>
              </div>
              <div class="px-3">
                <div v-for="s in grp.items" :key="s.id" class="flex items-center gap-3 px-2.5 py-2.5 border-b border-line-hair last:border-0">
                  <button type="button" class="w-[18px] h-[18px] rounded-[5px] shrink-0 flex items-center justify-center transition-colors" :class="s.isPurchased ? 'bg-bought' : 'border-2 border-[#2a3a4e]'" :disabled="!canMark" @click="toggleArticlePaid(grp.all, s)">
                    <UIcon v-if="s.isPurchased" name="i-heroicons-check" class="w-3 h-3 text-on-accent" />
                  </button>
                  <span class="flex-1 min-w-0 text-[13px] truncate flex items-center gap-1.5" :class="s.isPurchased ? 'text-muted line-through' : 'text-ink'">
                    {{ s.name }}
                    <a v-if="s.website" :href="s.website" target="_blank" class="text-faint hover:text-sky shrink-0" @click.stop><UIcon name="i-heroicons-arrow-top-right-on-square" class="w-3 h-3" /></a>
                    <UIcon v-if="grp.best && s.id === grp.best.id && grp.items.length > 1" name="i-heroicons-sparkles" class="w-3 h-3 text-bought/70 shrink-0" />
                  </span>
                  <button v-if="canMark" type="button" class="text-[9px] font-bold px-1.5 py-0.5 rounded-[5px] transition-colors shrink-0" :class="s.isPlanned ? 'text-planned bg-chip-planned' : 'text-faint border border-line hover:text-planned hover:border-planned'" @click="toggleArticlePlanned(grp.all, s)">{{ s.isPlanned ? t('catalog.planned') : t('catalog.planQ') }}</button>
                  <span v-if="s.price != null" class="mono text-[12.5px] font-semibold shrink-0 w-20 text-right" :class="s.isPurchased ? 'text-bought' : s.isPlanned ? 'text-planned' : 'text-ink'">{{ s.price.toFixed(0) }} {{ s.currency }}</span>
                </div>
              </div>
            </template>

            <div v-if="!productGroups.length && !articleGroups.length" class="px-4 py-8 text-center text-faint text-sm">{{ t('booth.noProductsYet') }}</div>
          </div>

          <!-- footer bar -->
          <div class="px-4 py-3 border-t border-line bg-sidebar flex items-center justify-between flex-wrap gap-2">
            <div class="text-[12px] text-muted">
              {{ t('plist.showing') }} <b class="text-ink">{{ filteredProducts.length }}</b> ·
              <b class="text-bought">{{ filterCounts.bought }}</b> {{ t('plist.bought').toLowerCase() }} ·
              <b class="text-planned">{{ filterCounts.planned }}</b> {{ t('plist.planned').toLowerCase() }}
            </div>
            <button v-if="canEdit" class="flex items-center gap-1.5 px-3.5 py-2 rounded-field grad-primary text-[12.5px] font-bold" @click="showAddProduct = true">
              <UIcon name="i-heroicons-plus" class="w-3.5 h-3.5" /> {{ t('booth.addProduct') }}
            </button>
          </div>
        </div>
      </div>

      <!-- Empty state (no plain-text products and no articles) -->
      <div v-if="!standaloneProducts.length && !articleGroups.length" class="text-center py-12 text-faint">
        <UIcon name="i-heroicons-shopping-bag" class="w-12 h-12 mx-auto mb-3 text-faint-2" />
        <p>{{ (booth.images?.length ?? 0) > 0 ? t('booth.noTextProducts') : t('booth.noContent') }}</p>
        <p v-if="canEdit" class="text-sm mt-1">{{ t('booth.uploadHint') }}</p>
      </div>
    </div>
    </div><!-- /Products tab -->

    <!-- ═══════════════ ARTICLE GALLERY TAB ═══════════════ -->
    <div v-show="activeTab === 'articles'">
      <div class="flex items-center justify-between mb-4">
        <div class="flex items-center gap-2">
          <UIcon name="i-heroicons-photo" class="w-4 h-4" :class="isConv ? 'text-conv-soft' : 'text-sky'" />
          <h3 class="text-[15px] font-bold text-ink-strong">{{ t('booth.tabArticles') }}</h3>
        </div>
        <button
          v-if="canEdit"
          class="flex items-center gap-1.5 px-3.5 py-2 rounded-field border text-[12.5px] font-semibold transition-colors"
          :class="isConv ? 'border-[#3b3a6b] text-conv-soft hover:bg-chip-conv/50' : 'border-line-focus text-sky-soft hover:bg-chip-sky/50'"
          @click="showUploadImage = true"
        >
          <UIcon name="i-heroicons-plus" class="w-3.5 h-3.5" /> {{ t('booth.newArticle') }}
        </button>
      </div>

      <!-- article-scoped person filter notice -->
      <button
        v-if="personsStore.currentPersonId && hiddenArticleCount > 0"
        type="button"
        class="w-full flex items-center gap-2 text-xs pb-2 mb-3 border-b border-line-soft hover:text-ink transition-colors flex-wrap"
        :class="showAllArticles ? 'text-sky-soft' : 'text-faint'"
        @click="showAllArticles = !showAllArticles"
      >
        <UIcon :name="showAllArticles ? 'i-heroicons-eye' : 'i-heroicons-funnel'" class="w-3.5 h-3.5 shrink-0" />
        <template v-if="showAllArticles">
          <span>{{ t('booth.showingAllArticles') }}</span>
          <span class="text-sky underline ml-auto">{{ t('booth.showOnlyMine') }}</span>
        </template>
        <template v-else>
          <span>{{ t('booth.showingArticlesFor') }}</span>
          <strong class="text-ink">{{ personsStore.persons.find(p => p.id === personsStore.currentPersonId)?.name }}</strong>
          <span class="text-faint-2">({{ hiddenArticleCount }} {{ t('booth.hidden') }})</span>
          <span class="text-sky underline ml-auto">{{ t('booth.showAllArticles') }}</span>
        </template>
      </button>

      <div v-if="!articleCards.length && !productTabImages.length" class="text-center py-12 text-faint">
        <UIcon name="i-heroicons-photo" class="w-12 h-12 mx-auto mb-3 text-faint-2" />
        <p>{{ t('booth.noArticles') }}</p>
      </div>

      <div v-if="articleCards.length" class="flex flex-col gap-3">
        <div v-for="card in articleCards" :id="`article-${card.img.id}`" :key="card.img.id" class="rounded-card border border-line bg-surface overflow-hidden scroll-mt-24">
          <div class="flex gap-3 p-3.5 cursor-pointer select-none" @click="toggleArticleCollapse(card.img.id)">
            <div class="w-16 h-16 rounded-[10px] overflow-hidden shrink-0 flex items-center justify-center" :class="isConv ? 'cover-conv' : 'cover-travel'">
              <img v-if="card.img.path" :src="card.img.path" alt="" class="w-full h-full object-cover" loading="lazy" />
              <UIcon v-else name="i-heroicons-photo" class="w-6 h-6" :class="isConv ? 'text-conv-soft' : 'text-sky-soft'" />
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="text-sm font-bold text-ink-strong">{{ card.img.customName || card.img.originalName }}</span>
                <span v-if="card.anyMust" class="text-[9px] font-bold text-must bg-chip-must px-1.5 py-0.5 rounded-[5px]">{{ t('product.must') }}</span>
                <span v-else-if="card.anyPlanned && !card.anyPurchased" class="text-[9px] font-bold text-planned bg-chip-planned px-1.5 py-0.5 rounded-[5px]">{{ t('catalog.planned') }}</span>
              </div>
              <div class="text-[11.5px] text-muted mt-1">{{ t('booth.articleCompare', { n: card.sources.length }) }}</div>
              <div v-if="card.best" class="flex items-center gap-2 mt-2 flex-wrap">
                <span class="text-[10.5px] font-semibold text-bought bg-chip-bought px-2 py-0.5 rounded-md mono">{{ t('booth.articleBest') }} {{ (card.best.price ?? 0).toFixed(0) }} {{ card.currency }}</span>
                <span v-if="card.saved > 0.5" class="text-[10.5px] text-faint">{{ t('booth.articleSaved', { amt: `${card.saved.toFixed(0)} ${card.currency}` }) }}</span>
              </div>
            </div>
            <UIcon :name="collapsedArticles[card.img.id] ? 'i-heroicons-chevron-down' : 'i-heroicons-chevron-up'" class="w-4 h-4 text-faint shrink-0 self-center" />
          </div>
          <div v-show="!collapsedArticles[card.img.id]" class="border-t border-line-soft px-3.5">
            <div v-for="s in card.sources" :key="s.id" class="flex items-center gap-2.5 py-2.5 border-b border-line-hair last:border-0">
              <button
                type="button"
                class="w-[18px] h-[18px] rounded-[5px] shrink-0 flex items-center justify-center transition-colors"
                :class="s.isPurchased ? 'bg-bought' : 'border-2 border-[#2a3a4e]'"
                :disabled="!canMark"
                @click="toggleArticlePaid(card.sources, s)"
              >
                <UIcon v-if="s.isPurchased" name="i-heroicons-check" class="w-3 h-3 text-on-accent" />
              </button>
              <span class="flex-1 min-w-0 text-[12.5px] truncate flex items-center gap-1.5" :class="s.isPurchased ? 'text-muted line-through' : 'text-ink'">
                {{ s.name }}
                <a v-if="s.website" :href="s.website" target="_blank" class="text-faint hover:text-sky shrink-0" @click.stop>
                  <UIcon name="i-heroicons-arrow-top-right-on-square" class="w-3 h-3" />
                </a>
                <UIcon v-if="card.best && s.id === card.best.id && card.sources.length > 1" name="i-heroicons-sparkles" class="w-3 h-3 text-bought/70 shrink-0" />
              </span>
              <button
                v-if="canMark"
                type="button"
                class="text-[9px] font-bold px-1.5 py-0.5 rounded-[5px] transition-colors shrink-0"
                :class="s.isPlanned ? 'text-planned bg-chip-planned' : 'text-faint border border-line hover:text-planned hover:border-planned'"
                @click="toggleArticlePlanned(card.sources, s)"
              >{{ s.isPlanned ? t('catalog.planned') : t('catalog.planQ') }}</button>
              <span v-if="s.price != null" class="mono text-[12.5px] font-semibold shrink-0 w-20 text-right" :class="s.isPurchased ? 'text-bought' : s.isPlanned ? 'text-planned' : 'text-ink'">{{ s.price.toFixed(0) }} {{ s.currency }}</span>
            </div>
            <div v-if="!card.sources.length" class="py-3 text-center text-xs text-faint">{{ t('booth.articleSources', { n: 0 }) }}</div>
          </div>
        </div>
      </div>

      <!-- Catalog pages: scanned pages with drawn/annotated products (shown with the image). -->
      <div v-if="productTabImages.length" :class="['space-y-8 mt-4', canEdit && productTabImages.length > 1 ? 'pl-8' : '']">
        <div v-if="productTabImages.length >= 2" class="flex items-center justify-end pb-1">
          <UButton
            variant="ghost"
            color="gray"
            size="xs"
            :icon="allExpanded ? 'i-heroicons-bars-arrow-down' : 'i-heroicons-bars-arrow-up'"
            @click="allExpanded = !allExpanded"
          >
            {{ allExpanded ? t('booth.collapseAll') : t('booth.expandAll') }}
          </UButton>
        </div>
        <VueDraggable
          v-model="draggableImages"
          tag="div"
          class="space-y-8"
          handle=".image-drag-handle"
          :animation="180"
          :disabled="!canEdit || productTabImages.length < 2"
          ghost-class="opacity-40"
          drag-class="cursor-grabbing"
          @start="onImagesDragStart"
          @end="onImagesDragEnd"
        >
          <div v-for="img in draggableImages" :key="img.id" class="relative group/img">
            <button
              v-if="canEdit && productTabImages.length > 1"
              type="button"
              class="image-drag-handle absolute -left-8 top-2 w-6 h-6 flex items-center justify-center rounded bg-surface-2 border border-line text-muted hover:text-ink hover:border-line-focus cursor-grab active:cursor-grabbing touch-none opacity-70 hover:opacity-100 transition-opacity z-10"
              :title="t('common.drag')"
            >
              <UIcon name="i-heroicons-bars-3" class="w-3.5 h-3.5" />
            </button>
            <CatalogImageViewer
              :image="img"
              :products="groupedByImage[img.id] ?? []"
              :presets="presets"
              :default-expanded="allExpanded"
            />
          </div>
        </VueDraggable>
      </div>
    </div><!-- /Article gallery tab -->

    <!-- ═══════════════ RECEIPT MODE TAB ═══════════════ -->
    <div v-show="activeTab === 'receipt'">
      <div v-if="!receiptTabImages.length" class="text-center py-12 text-faint">
        <UIcon name="i-heroicons-receipt-percent" class="w-12 h-12 mx-auto mb-3 text-faint-2" />
        <p>{{ t('booth.noReceipts') }}</p>
        <button v-if="canEdit" class="mt-3 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-field border border-line text-muted hover:text-ink text-[12.5px] font-semibold" @click="showUploadImage = true">
          <UIcon name="i-heroicons-photo" class="w-3.5 h-3.5" /> {{ t('booth.uploadImage') }}
        </button>
      </div>
      <div v-else class="space-y-8">
        <CatalogImageViewer
          v-for="img in receiptTabImages"
          :key="img.id"
          :image="img"
          :products="groupedByImage[img.id] ?? []"
          :presets="presets"
          :booth-products="booth.products"
          :default-expanded="true"
        />
      </div>
    </div><!-- /Receipt mode tab -->

    <!-- Floating add button — stays put while the list scrolls. Context-aware:
         "Add product" on Products, "New article" on the gallery. -->
    <button
      v-if="canEdit && activeTab !== 'receipt'"
      type="button"
      class="fixed bottom-24 lg:bottom-6 right-4 lg:right-6 z-40 flex items-center gap-2 px-5 py-3.5 rounded-full text-[13px] font-bold shadow-lg"
      :class="isConv ? 'grad-conv' : 'grad-primary'"
      :title="addLabel"
      @click="onFabAdd"
    >
      <UIcon name="i-heroicons-plus" class="w-5 h-5" />
      <span class="hidden sm:inline">{{ addLabel }}</span>
    </button>

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

    <UModal v-model="showDeleteProductModal" :ui="{ width: 'sm:max-w-sm', background: '', ring: '', rounded: 'rounded-window', shadow: '' }">
      <div class="bg-surface border border-line rounded-window p-6 text-center">
        <div class="w-12 h-12 mx-auto mb-3.5 rounded-card bg-chip-must flex items-center justify-center">
          <UIcon name="i-heroicons-trash" class="w-6 h-6 text-must" />
        </div>
        <h3 class="text-[17px] font-bold text-ink-strong mb-1.5">{{ t('booth.deleteProduct') }}</h3>
        <p class="text-[13px] text-muted mb-5 leading-relaxed">{{ t('booth.deleteProductDesc') }}</p>
        <div class="flex gap-2.5">
          <button class="flex-1 py-2.5 rounded-field border border-line text-ink text-[13px] font-semibold" @click="showDeleteProductModal = false">{{ t('common.cancel') }}</button>
          <button class="flex-1 py-2.5 rounded-field bg-must text-chip-must text-[13px] font-bold" @click="handleDeleteProduct">{{ t('common.delete') }}</button>
        </div>
      </div>
    </UModal>

    <UModal v-model="showDiscountModal" :ui="{ width: 'sm:max-w-md' }">
      <UCard>
        <template #header>
          <h3 class="font-bold text-ink-strong">
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
                    ? 'border-sky bg-chip-sky text-ink-strong'
                    : 'border-line bg-surface-2 text-muted hover:border-line-focus',
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
                    ? 'border-sky bg-chip-sky text-ink-strong'
                    : 'border-line bg-surface-2 text-muted hover:border-line-focus',
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
                :class="discountForm.scopeValue === s ? 'bg-sky border-sky text-on-accent' : 'border-line text-muted hover:border-line-focus'"
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
                class="px-2 py-1 text-xs rounded border border-dashed border-line text-faint hover:border-sky hover:text-sky-soft transition-colors"
                @click="startAddCustomScope"
              >+</button>
            </div>
            <div v-else class="flex flex-wrap gap-1 items-center">
              <button
                v-for="c in categoryPills" :key="c" type="button"
                class="px-1.5 py-0.5 text-xs rounded border transition-colors"
                :class="discountForm.scopeValue === c ? 'bg-sky border-sky text-on-accent' : 'border-line text-muted hover:border-line-focus'"
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
                class="px-1.5 py-0.5 text-xs rounded border border-dashed border-line text-faint hover:border-sky hover:text-sky-soft transition-colors"
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

          <div class="text-xs text-muted px-2.5 py-2 rounded-field bg-surface-2 border border-line">
            <UIcon name="i-heroicons-information-circle" class="w-3.5 h-3.5 inline mr-1 text-sky" />
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
            <button class="px-4 py-2 rounded-field text-[13px] font-semibold text-muted hover:text-ink" @click="showDiscountModal = false">{{ t('common.cancel') }}</button>
            <button
              class="px-4 py-2 rounded-field grad-primary text-[13px] font-bold disabled:opacity-50"
              :disabled="!discountFormValid"
              @click="saveDiscount"
            >
              {{ t('common.save') }}
            </button>
          </div>
        </template>
      </UCard>
    </UModal>
  </div>
</template>
