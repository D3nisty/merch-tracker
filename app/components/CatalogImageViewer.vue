<script setup lang="ts">
import { useEventsStore } from '~/stores/events'
import { useAuthStore } from '~/stores/auth'
import { usePersonsStore } from '~/stores/persons'
import type { CatalogImage, Product, BoothPreset } from '~/stores/events'

const props = defineProps<{
  image: CatalogImage
  products: Product[]
  presets?: BoothPreset[]
  boothProducts?: Product[]
}>()

const store = useEventsStore()
const authStore = useAuthStore()
const personsStore = usePersonsStore()

const expanded = ref(true)
const fullscreen = ref(false)
const showOcr = ref(false)
const mode = ref(props.image.displayMode)
const splitCount = ref(props.image.splitCount ?? 2)

// ── Person options ────────────────────────────────────────────────────
const personOptions = computed(() => [
  { value: '', label: '— Unassigned —' },
  ...personsStore.persons.map(p => ({ value: p.id, label: p.name })),
])
const COLOR_MAP: Record<string, string> = {
  purple: 'bg-purple-500', blue: 'bg-blue-500', green: 'bg-green-500',
  yellow: 'bg-yellow-500', red: 'bg-red-500', pink: 'bg-pink-500',
  orange: 'bg-orange-500', teal: 'bg-teal-500',
}
function personById(id: string | null) {
  return id ? personsStore.persons.find(p => p.id === id) ?? null : null
}

// ── Name editing ──────────────────────────────────────────────────────
const editingName = ref(false)
const nameInput = ref(props.image.customName || props.image.originalName)
const nameInputEl = ref<HTMLInputElement>()

async function startEditName() {
  if (!authStore.isEditing) return
  nameInput.value = props.image.customName || props.image.originalName
  editingName.value = true
  await nextTick()
  nameInputEl.value?.select()
}

async function saveName() {
  editingName.value = false
  const value = nameInput.value.trim()
  if (!value) return
  await store.updateImage(props.image.id, { customName: value })
}

// ── Delete image ──────────────────────────────────────────────────────
const showDeleteConfirm = ref(false)
async function handleDeleteImage() {
  await store.deleteImage(props.image.id, props.image.boothId)
  showDeleteConfirm.value = false
}

// ── Display mode ──────────────────────────────────────────────────────
const splits = computed(() => {
  if (mode.value !== 'split') return []
  return Array.from({ length: splitCount.value }, (_, i) => i)
})

function splitStyle(index: number) {
  const pct = 100 / splitCount.value
  return { top: `${index * pct}%`, height: `${pct}%`, width: '100%' }
}

async function updateDisplayMode() {
  await store.updateImage(props.image.id, { displayMode: mode.value, splitCount: splitCount.value })
}

// ── Escape key ────────────────────────────────────────────────────────
onMounted(() => document.addEventListener('keydown', onKey))
onUnmounted(() => document.removeEventListener('keydown', onKey))
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    if (fullscreen.value) closeFullscreen()
    else if (annotateMode.value) { annotateMode.value = false; cancelAnnotation() }
  }
}

function closeFullscreen() {
  fullscreen.value = false
  cancelAnnotation()
}

// ── Manual annotation ─────────────────────────────────────────────────
const annotateMode = ref(false)
const imgRef = ref<HTMLImageElement>()
const fsImgRef = ref<HTMLImageElement>()

interface DrawRect { x: number; y: number; w: number; h: number }

const drawStart = ref<{ x: number; y: number } | null>(null)
const liveRect = ref<DrawRect | null>(null)
const pendingRect = ref<DrawRect | null>(null)
const hoveredProductId = ref<string | null>(null)

const CURRENCIES = ['EUR', 'USD', 'JPY', 'GBP', 'CHF', 'CAD', 'AUD', 'CNY', 'KRW']
const SIZES = ['A6', 'A5', 'A4', 'A3', 'A2', 'B2', 'B3', '90×50cm', '40×23.5cm', '25cm', '20cm', '15cm', '10cm']
const sizeOptions = [{ value: '', label: '— No size —' }, ...SIZES.map(s => ({ value: s, label: s }))]
const CURRENCY_SYMBOLS: Record<string, string> = {
  EUR: '€', USD: '$', JPY: '¥', GBP: '£', CHF: 'Fr', CAD: 'C$', AUD: 'A$', CNY: '¥', KRW: '₩',
}
const QUICK_CATS = ['Print', 'Keychain', 'Sticker', 'Acrylic Figure', 'Figure', 'Mousepad', 'Shirt', 'Pin', 'Plush', 'Other']

function currencySymbol(code: string) {
  return CURRENCY_SYMBOLS[code] ?? code
}

const currencyOptions = computed(() => CURRENCIES.map(c => ({ value: c, label: `${c} ${currencySymbol(c)}` })))

function defaultPersonId() { return personsStore.currentPersonId ?? '' }

const annotateForm = reactive({ name: '', price: '' as string | number, currency: 'EUR', category: '', size: '', website: '', personId: '' })
const showQuickAdd = ref(false)
const quickForm = reactive({ name: '', price: '' as string | number, currency: 'EUR', category: '', size: '', website: '', personId: '' })

// Article mode: add source form
const showAddSource = ref(false)
const sourceForm = reactive({ name: '', price: '' as string | number, currency: 'EUR', website: '', notes: '', personId: '' })

// Article mode: expand/edit per source
const expandedSourceId = ref<string | null>(null)
const editingSourceId = ref<string | null>(null)
const editSourceForm = reactive({ name: '', price: '' as string | number, currency: 'EUR', website: '', notes: '', personId: '' })

function toggleSourceExpand(id: string) {
  if (editingSourceId.value === id) return
  expandedSourceId.value = expandedSourceId.value === id ? null : id
}

function startEditSource(p: Product) {
  expandedSourceId.value = p.id
  editingSourceId.value = p.id
  Object.assign(editSourceForm, {
    name: p.name,
    price: p.price != null ? String(p.price) : '',
    currency: p.currency || 'EUR',
    website: p.website || '',
    notes: p.notes || '',
    personId: p.personId || '',
  })
}

function cancelEditSource() {
  editingSourceId.value = null
}

async function saveEditSource(id: string) {
  await store.updateProduct(id, {
    name: editSourceForm.name.trim() || undefined,
    price: editSourceForm.price ? Number(editSourceForm.price) : null,
    currency: editSourceForm.currency,
    website: editSourceForm.website || null,
    notes: editSourceForm.notes || null,
    personId: editSourceForm.personId || null,
  })
  editingSourceId.value = null
}

// ── Catalog product inline edit ───────────────────────────────────────
const editingProductId = ref<string | null>(null)
const editProductForm = reactive({ name: '', price: '' as string | number, currency: 'EUR', size: '', category: '', website: '', personId: '' })

function startEditProduct(p: Product) {
  editingProductId.value = p.id
  Object.assign(editProductForm, {
    name: p.name,
    price: p.price != null ? String(p.price) : '',
    currency: p.currency || 'EUR',
    size: p.size || '',
    category: p.category || '',
    website: p.website || '',
    personId: p.personId || '',
  })
}

function cancelEditProduct() {
  editingProductId.value = null
}

async function saveEditProduct(id: string) {
  await store.updateProduct(id, {
    name: editProductForm.name.trim() || undefined,
    price: editProductForm.price ? Number(editProductForm.price) : null,
    currency: editProductForm.currency,
    size: editProductForm.size || null,
    category: editProductForm.category || null,
    website: editProductForm.website || null,
    personId: editProductForm.personId || null,
  })
  editingProductId.value = null
}

// ── Preset quick-fill ─────────────────────────────────────────────────
function applyPreset(preset: BoothPreset, form: Record<string, unknown>) {
  form.price = preset.price
  form.currency = preset.currency
  form.size = preset.label
}

function activeImgRef(): HTMLImageElement | undefined {
  return fullscreen.value ? fsImgRef.value : imgRef.value
}

function getPct(e: MouseEvent): { x: number; y: number } {
  const el = activeImgRef()
  if (!el) return { x: 0, y: 0 }
  const r = el.getBoundingClientRect()
  return {
    x: Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100)),
    y: Math.max(0, Math.min(100, ((e.clientY - r.top) / r.height) * 100)),
  }
}

function onImgMouseDown(e: MouseEvent) {
  if (!annotateMode.value || !authStore.isEditing || props.image.imageType !== 'catalog') return
  e.preventDefault()
  const p = getPct(e)
  drawStart.value = p
  liveRect.value = { x: p.x, y: p.y, w: 0, h: 0 }
  pendingRect.value = null
}

function onImgMouseMove(e: MouseEvent) {
  if (!annotateMode.value || !drawStart.value) return
  const p = getPct(e)
  liveRect.value = {
    x: Math.min(drawStart.value.x, p.x),
    y: Math.min(drawStart.value.y, p.y),
    w: Math.abs(p.x - drawStart.value.x),
    h: Math.abs(p.y - drawStart.value.y),
  }
}

function onImgMouseUp() {
  if (!annotateMode.value || !liveRect.value) return
  if (liveRect.value.w < 1.5 || liveRect.value.h < 1.5) {
    liveRect.value = null
    drawStart.value = null
    return
  }
  pendingRect.value = { ...liveRect.value }
  liveRect.value = null
  drawStart.value = null
  Object.assign(annotateForm, { name: '', price: '', currency: 'EUR', category: '', size: '', website: '', personId: defaultPersonId() })
}

function cancelAnnotation() {
  pendingRect.value = null
  liveRect.value = null
  drawStart.value = null
}

async function saveAnnotation() {
  if (!pendingRect.value || !annotateForm.name.trim()) return
  await store.createProduct({
    boothId: props.image.boothId,
    catalogImageId: props.image.id,
    name: annotateForm.name.trim(),
    price: annotateForm.price ? Number(annotateForm.price) : undefined,
    currency: annotateForm.currency,
    category: annotateForm.category || undefined,
    size: annotateForm.size || undefined,
    website: annotateForm.website || undefined,
    personId: annotateForm.personId || undefined,
    regionX: pendingRect.value.x,
    regionY: pendingRect.value.y,
    regionW: pendingRect.value.w,
    regionH: pendingRect.value.h,
  })
  pendingRect.value = null
  Object.assign(annotateForm, { name: '', price: '', currency: 'EUR', category: '', size: '', website: '', personId: defaultPersonId() })
}

async function saveQuickAdd() {
  if (!quickForm.name.trim()) return
  await store.createProduct({
    boothId: props.image.boothId,
    catalogImageId: props.image.id,
    name: quickForm.name.trim(),
    price: quickForm.price ? Number(quickForm.price) : undefined,
    currency: quickForm.currency,
    category: quickForm.category || undefined,
    size: quickForm.size || undefined,
    website: quickForm.website || undefined,
    personId: quickForm.personId || undefined,
  })
  showQuickAdd.value = false
  Object.assign(quickForm, { name: '', price: '', currency: 'EUR', category: '', size: '', website: '', personId: defaultPersonId() })
}

async function saveSource() {
  if (!sourceForm.name.trim()) return
  await store.createProduct({
    boothId: props.image.boothId,
    catalogImageId: props.image.id,
    name: sourceForm.name.trim(),
    price: sourceForm.price ? Number(sourceForm.price) : undefined,
    currency: sourceForm.currency,
    website: sourceForm.website || undefined,
    notes: sourceForm.notes || undefined,
    personId: sourceForm.personId || undefined,
  })
  showAddSource.value = false
  Object.assign(sourceForm, { name: '', price: '', currency: 'EUR', website: '', notes: '', personId: defaultPersonId() })
}

async function markAsPaid(product: Product) {
  if (product.isPurchased) {
    await store.updateProduct(product.id, { isPurchased: false })
    return
  }
  const currentPaid = props.products.find(p => p.isPurchased && p.id !== product.id)
  if (currentPaid) {
    await store.updateProduct(currentPaid.id, { isPurchased: false })
  }
  await store.updateProduct(product.id, { isPurchased: true })
}

const paidSource = computed(() => props.products.find(p => p.isPurchased))

const regionProducts = computed(() => props.products.filter(p => p.regionX !== null && p.regionX !== undefined))

function regionStyle(p: Product) {
  return {
    left: p.regionX + '%',
    top: p.regionY + '%',
    width: p.regionW + '%',
    height: p.regionH + '%',
  }
}

// ── OCR ───────────────────────────────────────────────────────────────
const ocrRunning = ref(false)
const ocrResults = ref<Array<{ text: string; price: number | null }>>([])

async function runOcr() {
  ocrRunning.value = true
  ocrResults.value = []
  try {
    const { createWorker } = await import('tesseract.js')
    const worker = await createWorker('eng+deu')
    const { data: { text } } = await worker.recognize(props.image.path)
    await worker.terminate()
    const priceRegex = /(\d+(?:[.,]\d{1,2})?)\s*[€$¥]/
    ocrResults.value = text.split('\n').filter(l => l.trim())
      .filter(l => priceRegex.test(l))
      .map(l => {
        const match = l.match(/(\d+(?:[.,]\d{1,2})?)/)
        const price = match ? parseFloat(match[1].replace(',', '.')) : null
        return { text: l.trim(), price }
      })
      .slice(0, 30)
  } finally {
    ocrRunning.value = false
    showOcr.value = true
  }
}

async function addFromOcr(item: { text: string; price: number | null }) {
  await store.createProduct({
    boothId: props.image.boothId,
    catalogImageId: props.image.id,
    name: item.text.slice(0, 100),
    price: item.price ?? undefined,
  })
}

// ── Receipt: all booth products ───────────────────────────────────────
const receiptProducts = computed(() => props.boothProducts ?? [])

async function toggleReceiptProduct(product: Product) {
  await store.togglePurchased(product)
}

const displayName = computed(() => props.image.customName || props.image.originalName)

const badgeColor = computed(() => {
  if (props.image.imageType === 'article') return 'orange'
  if (props.image.imageType === 'receipt') return 'green'
  return 'purple'
})

const badgeLabel = computed(() => {
  if (props.image.imageType === 'article') return 'Article'
  if (props.image.imageType === 'receipt') return 'Receipt'
  return 'Catalog'
})

// ── Shared form fragment helpers (rendered inline in template) ────────
// Open quick add / add source with person pre-filled
function openQuickAdd() {
  quickForm.personId = defaultPersonId()
  showQuickAdd.value = !showQuickAdd.value
  pendingRect.value = null
}
function openAddSource() {
  sourceForm.personId = defaultPersonId()
  showAddSource.value = !showAddSource.value
}
</script>

<template>
  <div class="border border-gray-800 rounded-xl overflow-hidden">
    <!-- Header -->
    <div class="flex items-center gap-2 px-4 py-3 bg-gray-900">
      <UButton
        :icon="expanded ? 'i-heroicons-chevron-down' : 'i-heroicons-chevron-right'"
        variant="ghost" color="gray" size="xs" class="shrink-0"
        @click="expanded = !expanded"
      />

      <!-- Editable name -->
      <input
        v-if="editingName"
        ref="nameInputEl"
        v-model="nameInput"
        class="bg-gray-800 border border-purple-500 rounded px-2 py-0.5 text-sm text-white focus:outline-none flex-1 min-w-0"
        @blur="saveName"
        @keydown.enter="saveName"
        @keydown.escape.stop="editingName = false"
      />
      <button
        v-else
        type="button"
        class="font-medium text-white text-sm text-left truncate flex-1 min-w-0"
        :class="authStore.isEditing ? 'hover:text-purple-300' : 'cursor-default'"
        :title="displayName"
        @click="startEditName"
      >
        {{ displayName }}
      </button>

      <UBadge :label="badgeLabel" :color="badgeColor" variant="soft" size="xs" class="shrink-0" />
      <UBadge v-if="image.imageType === 'catalog'" :label="`${products.length}`" variant="soft" color="gray" size="xs" class="shrink-0" />
      <UBadge v-if="image.imageType === 'receipt'" :label="`${receiptProducts.filter(p=>p.isPurchased).length}/${receiptProducts.length}`" variant="soft" color="green" size="xs" class="shrink-0" />

      <div class="flex items-center gap-1 shrink-0">
        <template v-if="image.imageType === 'catalog' && authStore.isEditing">
          <UButton
            icon="i-heroicons-pencil-square"
            variant="ghost"
            :color="annotateMode ? 'purple' : 'gray'"
            size="xs"
            @click="annotateMode = !annotateMode; if (!annotateMode) cancelAnnotation()"
          >{{ annotateMode ? 'Done' : 'Annotate' }}</UButton>
          <USelect
            v-model="mode"
            :options="[{ value: 'full', label: 'Full' }, { value: 'split', label: 'Split' }]"
            option-attribute="label" value-attribute="value"
            size="xs" @change="updateDisplayMode"
          />
          <UInput
            v-if="mode === 'split'"
            v-model.number="splitCount"
            type="number" min="2" max="10" size="xs" class="w-16"
            @change="updateDisplayMode"
          />
          <UButton
            icon="i-heroicons-cpu-chip"
            variant="ghost" color="gray" size="xs"
            :loading="ocrRunning"
            @click="runOcr"
          />
        </template>
        <UButton icon="i-heroicons-arrows-pointing-out" variant="ghost" color="gray" size="xs" @click="fullscreen = true" />
        <UButton v-if="authStore.isEditing" icon="i-heroicons-trash" variant="ghost" color="red" size="xs" @click="showDeleteConfirm = true" />
      </div>
    </div>

    <div v-show="expanded">
      <!-- Annotate hint -->
      <div v-if="annotateMode && image.imageType === 'catalog' && authStore.isEditing" class="px-4 py-2 bg-purple-900/30 border-b border-purple-700/40 text-xs text-purple-300 flex items-center gap-2">
        <UIcon name="i-heroicons-pencil-square" class="w-3.5 h-3.5 shrink-0" />
        Drag a rectangle on the image to mark an item.
        <UButton size="xs" variant="link" color="purple" @click="fullscreen = true">Open full-screen ↗</UButton>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-0">
        <!-- Image panel -->
        <div
          class="relative bg-black select-none"
          :class="annotateMode && image.imageType === 'catalog' && authStore.isEditing ? 'cursor-crosshair' : ''"
          @mousedown="onImgMouseDown"
          @mousemove="onImgMouseMove"
          @mouseup="onImgMouseUp"
          @mouseleave="drawStart = null; liveRect = null"
        >
          <img ref="imgRef" :src="image.path" class="w-full h-auto block" draggable="false" />

          <template v-if="mode === 'split' && image.imageType === 'catalog'">
            <div v-for="(_, i) in splits" :key="i" :style="splitStyle(i)"
              class="absolute border-b border-dashed border-purple-500/50 pointer-events-none" />
            <div class="absolute inset-0 pointer-events-none">
              <div v-for="(_, i) in splits" :key="i"
                class="absolute left-1 text-purple-400 text-xs bg-black/50 px-1 rounded"
                :style="{ top: `${(i / splitCount) * 100}%` }">
                Section {{ i + 1 }}
              </div>
            </div>
          </template>

          <template v-if="image.imageType === 'catalog'">
            <div v-for="p in regionProducts" :key="`region-${p.id}`"
              class="absolute pointer-events-auto"
              :style="regionStyle(p)"
              @mouseenter="hoveredProductId = p.id"
              @mouseleave="hoveredProductId = null"
            >
              <div class="absolute inset-0 border-2 rounded transition-all"
                :class="[p.isPurchased ? 'border-green-400' : 'border-purple-400', hoveredProductId === p.id ? 'bg-purple-400/20' : '']" />
              <div class="absolute top-0 left-0 text-xs font-medium px-1 py-0.5 rounded-br truncate max-w-full leading-tight pointer-events-none"
                :class="p.isPurchased ? 'bg-green-600/90 text-white' : 'bg-purple-600/90 text-white'">
                {{ p.name }}
              </div>
            </div>
          </template>

          <div v-if="liveRect" class="absolute border-2 border-dashed border-yellow-400 bg-yellow-400/10 pointer-events-none rounded"
            :style="{ left: liveRect.x+'%', top: liveRect.y+'%', width: liveRect.w+'%', height: liveRect.h+'%' }" />
          <div v-if="pendingRect" class="absolute border-2 border-yellow-400 bg-yellow-400/15 pointer-events-none rounded"
            :style="{ left: pendingRect.x+'%', top: pendingRect.y+'%', width: pendingRect.w+'%', height: pendingRect.h+'%' }" />
        </div>

        <!-- CATALOG: products panel -->
        <div v-if="image.imageType === 'catalog'" class="p-4 space-y-2 bg-gray-950 max-h-[600px] overflow-y-auto">
          <div class="flex items-center justify-between mb-3">
            <span class="text-sm font-medium text-gray-300">Products from this image</span>
            <UButton v-if="authStore.isEditing" icon="i-heroicons-plus" size="xs" color="purple" variant="soft"
              @click="openQuickAdd">Add</UButton>
          </div>

          <!-- Quick add form -->
          <div v-if="authStore.isEditing && showQuickAdd" class="bg-gray-800 rounded-lg p-3 space-y-2">
            <UInput v-model="quickForm.name" placeholder="Product name…" size="sm" autofocus />
            <div class="grid grid-cols-2 gap-2">
              <UInput v-model="quickForm.price" type="number" step="0.01" placeholder="Price" size="sm" />
              <USelect v-model="quickForm.currency" :options="currencyOptions" size="sm" />
            </div>
            <div v-if="presets?.length" class="flex flex-wrap gap-1">
              <button v-for="preset in presets" :key="preset.id" type="button"
                class="px-2 py-0.5 text-xs rounded-full border border-gray-600 text-gray-400 hover:border-purple-500 hover:text-purple-300 transition-colors"
                @click="applyPreset(preset, quickForm)">{{ preset.label }} {{ preset.price }}{{ preset.currency }}</button>
            </div>
            <USelect v-model="quickForm.size" :options="sizeOptions" option-attribute="label" value-attribute="value" size="sm" />
            <UInput v-model="quickForm.website" placeholder="Website URL (optional)" size="sm" />
            <div class="flex flex-wrap gap-1">
              <button v-for="c in QUICK_CATS" :key="c" type="button"
                class="px-1.5 py-0.5 text-xs rounded border transition-colors"
                :class="quickForm.category === c ? 'bg-purple-600 border-purple-500 text-white' : 'border-gray-700 text-gray-400 hover:border-gray-500'"
                @click="quickForm.category = quickForm.category === c ? '' : c">{{ c }}</button>
            </div>
            <USelect v-model="quickForm.personId" :options="personOptions" option-attribute="label" value-attribute="value" size="sm" />
            <div class="flex gap-2">
              <UButton size="xs" color="purple" :disabled="!quickForm.name.trim()" @click="saveQuickAdd">Save</UButton>
              <UButton size="xs" variant="ghost" color="gray" @click="showQuickAdd = false">Cancel</UButton>
            </div>
          </div>

          <!-- Annotate form -->
          <div v-if="authStore.isEditing && pendingRect" class="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 space-y-2">
            <p class="text-xs font-medium text-yellow-400 flex items-center gap-1">
              <UIcon name="i-heroicons-pencil-square" class="w-3.5 h-3.5" />
              Name this marked item:
            </p>
            <UInput v-model="annotateForm.name" placeholder="e.g. Cherry Blossom A3 Print" size="sm" autofocus />
            <div class="grid grid-cols-2 gap-2">
              <UInput v-model="annotateForm.price" type="number" step="0.01" placeholder="Price" size="sm" />
              <USelect v-model="annotateForm.currency" :options="currencyOptions" size="sm" />
            </div>
            <div v-if="presets?.length" class="flex flex-wrap gap-1">
              <button v-for="preset in presets" :key="preset.id" type="button"
                class="px-2 py-0.5 text-xs rounded-full border border-gray-600 text-gray-400 hover:border-purple-500 hover:text-purple-300 transition-colors"
                @click="applyPreset(preset, annotateForm)">{{ preset.label }} {{ preset.price }}{{ preset.currency }}</button>
            </div>
            <USelect v-model="annotateForm.size" :options="sizeOptions" option-attribute="label" value-attribute="value" size="sm" />
            <UInput v-model="annotateForm.website" placeholder="Website URL (optional)" size="sm" />
            <div class="flex flex-wrap gap-1">
              <button v-for="c in QUICK_CATS" :key="c" type="button"
                class="px-1.5 py-0.5 text-xs rounded border transition-colors"
                :class="annotateForm.category === c ? 'bg-purple-600 border-purple-500 text-white' : 'border-gray-700 text-gray-400 hover:border-gray-500'"
                @click="annotateForm.category = annotateForm.category === c ? '' : c">{{ c }}</button>
            </div>
            <USelect v-model="annotateForm.personId" :options="personOptions" option-attribute="label" value-attribute="value" size="sm" />
            <div class="flex gap-2">
              <UButton size="xs" color="purple" :disabled="!annotateForm.name.trim()" @click="saveAnnotation">Save</UButton>
              <UButton size="xs" variant="ghost" color="gray" @click="cancelAnnotation">Cancel</UButton>
            </div>
          </div>

          <!-- Product list with inline editing -->
          <template v-for="product in products" :key="product.id">
            <!-- Inline edit form -->
            <div v-if="editingProductId === product.id" class="bg-gray-800 border border-purple-600/40 rounded-lg p-3 space-y-2">
              <UInput v-model="editProductForm.name" placeholder="Product name" size="sm" autofocus />
              <div class="grid grid-cols-2 gap-2">
                <UInput v-model="editProductForm.price" type="number" step="0.01" placeholder="Price" size="sm" />
                <USelect v-model="editProductForm.currency" :options="currencyOptions" size="sm" />
              </div>
              <div v-if="presets?.length" class="flex flex-wrap gap-1">
                <button v-for="preset in presets" :key="preset.id" type="button"
                  class="px-2 py-0.5 text-xs rounded-full border border-gray-600 text-gray-400 hover:border-purple-500 hover:text-purple-300 transition-colors"
                  @click="applyPreset(preset, editProductForm)">{{ preset.label }} {{ preset.price }}{{ preset.currency }}</button>
              </div>
              <USelect v-model="editProductForm.size" :options="sizeOptions" option-attribute="label" value-attribute="value" size="sm" />
              <UInput v-model="editProductForm.website" placeholder="Website URL" size="sm" />
              <div class="flex flex-wrap gap-1">
                <button v-for="c in QUICK_CATS" :key="c" type="button"
                  class="px-1.5 py-0.5 text-xs rounded border transition-colors"
                  :class="editProductForm.category === c ? 'bg-purple-600 border-purple-500 text-white' : 'border-gray-700 text-gray-400 hover:border-gray-500'"
                  @click="editProductForm.category = editProductForm.category === c ? '' : c">{{ c }}</button>
              </div>
              <USelect v-model="editProductForm.personId" :options="personOptions" option-attribute="label" value-attribute="value" size="sm" />
              <div class="flex gap-2">
                <UButton size="xs" color="purple" :disabled="!editProductForm.name.trim()" @click="saveEditProduct(product.id)">Save</UButton>
                <UButton size="xs" variant="ghost" color="gray" @click="cancelEditProduct">Cancel</UButton>
              </div>
            </div>

            <!-- Normal product row -->
            <div v-else
              class="flex items-center gap-1 group"
              :class="hoveredProductId === product.id ? 'ring-1 ring-purple-400 rounded-lg' : ''"
              @mouseenter="hoveredProductId = product.id"
              @mouseleave="hoveredProductId = null"
            >
              <ProductItem
                :product="product"
                class="flex-1"
                @toggle="store.togglePurchased(product)"
                @delete="store.deleteProduct(product.id)"
              />
              <UButton
                v-if="authStore.isEditing"
                icon="i-heroicons-pencil-square"
                variant="ghost" color="gray" size="xs"
                class="opacity-0 group-hover:opacity-100 shrink-0"
                @click="startEditProduct(product)"
              />
            </div>
          </template>

          <p v-if="!products.length && !pendingRect && !showQuickAdd" class="text-gray-600 text-sm text-center py-4">
            No products linked yet.
            <span v-if="authStore.isEditing"> Use <span class="text-purple-400">Annotate</span> to mark items on the image.</span>
          </p>

          <div v-if="showOcr && ocrResults.length" class="mt-4 border-t border-gray-800 pt-4">
            <div class="flex items-center justify-between mb-2">
              <span class="text-xs font-medium text-gray-400">OCR Detected Prices</span>
              <UButton icon="i-heroicons-x-mark" variant="ghost" color="gray" size="xs" @click="showOcr = false" />
            </div>
            <div class="space-y-1">
              <div v-for="(item, i) in ocrResults" :key="i" class="flex items-center gap-2 text-xs">
                <span class="flex-1 text-gray-300 truncate">{{ item.text }}</span>
                <span v-if="item.price" class="text-yellow-400 shrink-0">{{ item.price }}€</span>
                <UButton size="xs" variant="ghost" color="purple" icon="i-heroicons-plus" @click="addFromOcr(item)" />
              </div>
            </div>
          </div>
        </div>

        <!-- ARTICLE: price sources panel -->
        <div v-else-if="image.imageType === 'article'" class="p-4 bg-gray-950 max-h-[600px] overflow-y-auto space-y-2">
          <div class="flex items-center justify-between mb-3">
            <span class="text-sm font-medium text-gray-300">Price Sources</span>
            <UButton v-if="authStore.isEditing" icon="i-heroicons-plus" size="xs" color="orange" variant="soft"
              @click="openAddSource">Add Source</UButton>
          </div>

          <!-- Add source form -->
          <div v-if="authStore.isEditing && showAddSource" class="bg-gray-800 rounded-lg p-3 space-y-2 mb-2">
            <UInput v-model="sourceForm.name" placeholder="Shop / Source name" size="sm" autofocus />
            <div class="grid grid-cols-2 gap-2">
              <UInput v-model="sourceForm.price" type="number" step="0.01" placeholder="Price" size="sm" />
              <USelect v-model="sourceForm.currency" :options="currencyOptions" size="sm" />
            </div>
            <div v-if="presets?.length" class="flex flex-wrap gap-1">
              <button v-for="preset in presets" :key="preset.id" type="button"
                class="px-2 py-0.5 text-xs rounded-full border border-gray-600 text-gray-400 hover:border-orange-500 hover:text-orange-300 transition-colors"
                @click="applyPreset(preset, sourceForm)">{{ preset.label }} {{ preset.price }}{{ preset.currency }}</button>
            </div>
            <UInput v-model="sourceForm.website" placeholder="Website URL (optional)" size="sm" />
            <UTextarea v-model="sourceForm.notes" placeholder="Notes (optional)…" size="sm" :rows="2" />
            <USelect v-model="sourceForm.personId" :options="personOptions" option-attribute="label" value-attribute="value" size="sm" />
            <div class="flex gap-2">
              <UButton size="xs" color="orange" :disabled="!sourceForm.name.trim()" @click="saveSource">Save</UButton>
              <UButton size="xs" variant="ghost" color="gray" @click="showAddSource = false">Cancel</UButton>
            </div>
          </div>

          <!-- Source rows -->
          <div v-for="p in products" :key="p.id"
            class="border rounded-lg transition-colors overflow-hidden"
            :class="p.isPurchased ? 'border-green-500/40 bg-green-900/10' : 'border-gray-800 bg-gray-900'"
          >
            <div class="flex items-center gap-2 px-3 py-2">
              <div class="flex-1 min-w-0 cursor-pointer" @click="toggleSourceExpand(p.id)">
                <div class="flex items-center gap-2">
                  <span
                    v-if="personById(p.personId)"
                    :class="['w-2 h-2 rounded-full shrink-0', COLOR_MAP[personById(p.personId)!.color] ?? 'bg-purple-500']"
                    :title="personById(p.personId)!.name"
                  />
                  <span class="text-sm font-medium text-white">{{ p.name }}</span>
                  <span v-if="personById(p.personId)" class="text-xs text-gray-500">{{ personById(p.personId)!.name }}</span>
                </div>
                <div v-if="p.price" class="flex items-center gap-1.5 mt-0.5">
                  <span class="text-sm font-semibold" :class="p.isPurchased ? 'text-green-400' : 'text-yellow-400'">
                    {{ p.price.toFixed(2) }} {{ currencySymbol(p.currency) }}
                  </span>
                  <span class="text-xs text-gray-500">{{ p.currency }}</span>
                </div>
              </div>
              <UButton
                :icon="expandedSourceId === p.id ? 'i-heroicons-chevron-up' : 'i-heroicons-chevron-down'"
                variant="ghost" color="gray" size="xs"
                @click="toggleSourceExpand(p.id)"
              />
              <button
                type="button"
                class="text-xs px-2 py-1 rounded-full border transition-all font-medium shrink-0"
                :class="p.isPurchased ? 'bg-green-600 border-green-500 text-white' : 'border-gray-700 text-gray-400 hover:border-green-500 hover:text-green-400'"
                @click="markAsPaid(p)"
              >{{ p.isPurchased ? '✓ Paid' : 'Paid?' }}</button>
              <UButton v-if="authStore.isEditing" icon="i-heroicons-trash" variant="ghost" color="red" size="xs" @click="store.deleteProduct(p.id)" />
            </div>

            <div v-if="expandedSourceId === p.id" class="border-t border-gray-800 px-3 py-3">
              <div v-if="authStore.isEditing && editingSourceId === p.id" class="space-y-2">
                <UInput v-model="editSourceForm.name" placeholder="Source name" size="sm" autofocus />
                <div class="grid grid-cols-2 gap-2">
                  <UInput v-model="editSourceForm.price" type="number" step="0.01" placeholder="Price" size="sm" />
                  <USelect v-model="editSourceForm.currency" :options="currencyOptions" size="sm" />
                </div>
                <UInput v-model="editSourceForm.website" placeholder="Website URL" size="sm" />
                <UTextarea v-model="editSourceForm.notes" placeholder="Notes…" size="sm" :rows="2" />
                <USelect v-model="editSourceForm.personId" :options="personOptions" option-attribute="label" value-attribute="value" size="sm" />
                <div class="flex gap-2">
                  <UButton size="xs" color="purple" :disabled="!editSourceForm.name.trim()" @click="saveEditSource(p.id)">Save</UButton>
                  <UButton size="xs" variant="ghost" color="gray" @click="cancelEditSource">Cancel</UButton>
                </div>
              </div>
              <div v-else class="space-y-2">
                <a v-if="p.website" :href="p.website" target="_blank"
                  class="flex items-center gap-1.5 text-blue-400 hover:text-blue-300 text-sm break-all">
                  <UIcon name="i-heroicons-arrow-top-right-on-square" class="w-4 h-4 shrink-0" />
                  {{ p.website }}
                </a>
                <p v-if="p.notes" class="text-sm text-gray-400 leading-relaxed whitespace-pre-wrap">{{ p.notes }}</p>
                <p v-if="!p.website && !p.notes" class="text-xs text-gray-600 italic">No additional info.</p>
                <UButton v-if="authStore.isEditing" size="xs" variant="soft" color="gray" icon="i-heroicons-pencil-square" @click="startEditSource(p)">Edit</UButton>
              </div>
            </div>
          </div>

          <div v-if="paidSource" class="mt-2 p-3 bg-green-900/20 border border-green-700/30 rounded-lg flex items-center gap-2">
            <UIcon name="i-heroicons-check-circle" class="w-4 h-4 text-green-400 shrink-0" />
            <div>
              <span class="text-xs text-gray-400">Paid from</span>
              <span class="ml-1.5 text-sm font-medium text-white">{{ paidSource.name }}</span>
              <span v-if="paidSource.price" class="ml-2 text-sm font-bold text-green-400">
                {{ paidSource.price.toFixed(2) }} {{ currencySymbol(paidSource.currency) }}
              </span>
            </div>
          </div>

          <p v-if="!products.length && !showAddSource" class="text-gray-600 text-sm text-center py-4">
            Add price sources to compare where to buy this item.
          </p>
        </div>

        <!-- RECEIPT: booth products checklist -->
        <div v-else-if="image.imageType === 'receipt'" class="p-4 bg-gray-950 max-h-[600px] overflow-y-auto">
          <div class="mb-3">
            <p class="text-sm font-medium text-gray-300">Mark items from this receipt as purchased</p>
            <p class="text-xs text-gray-500 mt-0.5">Check off products that appear on this receipt</p>
          </div>

          <div v-if="receiptProducts.length" class="space-y-1">
            <label
              v-for="p in receiptProducts"
              :key="p.id"
              class="flex items-center gap-3 p-2.5 rounded-lg hover:bg-gray-900 cursor-pointer transition-colors"
            >
              <UCheckbox :model-value="p.isPurchased" @change="toggleReceiptProduct(p)" />
              <div class="flex-1 min-w-0">
                <span :class="['text-sm', p.isPurchased ? 'line-through text-gray-500' : 'text-white']">{{ p.name }}</span>
                <span v-if="p.size" class="ml-2 text-xs text-gray-500">{{ p.size }}</span>
              </div>
              <span v-if="p.price" :class="['text-sm font-medium shrink-0', p.isPurchased ? 'text-green-400' : 'text-yellow-400']">
                {{ (p.price * p.quantity).toFixed(2) }} {{ p.currency }}
              </span>
            </label>
          </div>

          <div v-else class="text-center py-8 text-gray-600 text-sm">No products in this booth yet.</div>

          <div v-if="receiptProducts.some(p => p.isPurchased)" class="mt-4 pt-4 border-t border-gray-800">
            <div class="flex items-center gap-2 text-sm">
              <UIcon name="i-heroicons-check-circle" class="w-4 h-4 text-green-400" />
              <span class="text-gray-400">{{ receiptProducts.filter(p => p.isPurchased).length }} of {{ receiptProducts.length }} marked as purchased</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Delete image confirmation -->
  <UModal v-model="showDeleteConfirm" :ui="{ width: 'sm:max-w-sm' }">
    <UCard>
      <template #header><h3 class="font-semibold text-white">Delete Image?</h3></template>
      <p class="text-gray-400 text-sm">This will permanently remove the image and all linked products.</p>
      <template #footer>
        <div class="flex gap-2 justify-end">
          <UButton variant="ghost" color="gray" @click="showDeleteConfirm = false">Cancel</UButton>
          <UButton color="red" @click="handleDeleteImage">Delete</UButton>
        </div>
      </template>
    </UCard>
  </UModal>

  <!-- ── Full-screen overlay ─────────────────────────────────────────── -->
  <Teleport to="body">
    <div
      v-if="fullscreen"
      class="fixed inset-0 z-50 bg-gray-950 flex flex-col"
      style="overscroll-behavior: none"
    >
      <!-- Toolbar -->
      <div class="flex items-center gap-3 px-4 py-3 bg-gray-900 border-b border-gray-800 shrink-0">
        <UButton icon="i-heroicons-x-mark" variant="ghost" color="gray" size="sm" @click="closeFullscreen">Close</UButton>
        <span class="text-white font-medium text-sm truncate">{{ displayName }}</span>
        <UBadge :label="badgeLabel" :color="badgeColor" variant="soft" size="sm" class="shrink-0" />
        <template v-if="image.imageType === 'catalog' && authStore.isEditing">
          <UButton
            icon="i-heroicons-pencil-square"
            :color="annotateMode ? 'purple' : 'gray'"
            variant="outline" size="sm"
            @click="annotateMode = !annotateMode; if (!annotateMode) cancelAnnotation()"
          >{{ annotateMode ? 'Drawing ON — drag to mark' : 'Enable Drawing' }}</UButton>
          <span v-if="annotateMode" class="text-xs text-purple-400">Drag a rectangle · Esc to cancel</span>
        </template>
        <span class="ml-auto text-xs text-gray-500 shrink-0">
          {{ products.length }} {{ image.imageType === 'article' ? 'sources' : 'products' }}
        </span>
      </div>

      <div class="flex flex-1 min-h-0">
        <!-- Image -->
        <div
          class="flex-1 overflow-auto bg-black select-none relative"
          :class="annotateMode && image.imageType === 'catalog' && authStore.isEditing ? 'cursor-crosshair' : 'cursor-default'"
          @mousedown="onImgMouseDown"
          @mousemove="onImgMouseMove"
          @mouseup="onImgMouseUp"
          @mouseleave="drawStart = null; liveRect = null"
        >
          <div class="relative inline-block min-w-full">
            <img ref="fsImgRef" :src="image.path" class="w-full h-auto block" draggable="false" />

            <template v-if="image.imageType === 'catalog'">
              <div v-for="p in regionProducts" :key="`fs-region-${p.id}`"
                class="absolute pointer-events-auto"
                :style="regionStyle(p)"
                @mouseenter="hoveredProductId = p.id"
                @mouseleave="hoveredProductId = null"
              >
                <div class="absolute inset-0 border-2 rounded transition-all"
                  :class="[p.isPurchased ? 'border-green-400' : 'border-purple-400', hoveredProductId === p.id ? 'bg-purple-400/25' : 'bg-purple-400/05']" />
                <div class="absolute top-0 left-0 text-sm font-semibold px-1.5 py-0.5 rounded-br leading-tight pointer-events-none"
                  :class="p.isPurchased ? 'bg-green-600/90 text-white' : 'bg-purple-600/90 text-white'">
                  {{ p.name }}
                  <span v-if="p.price" class="ml-1 font-normal opacity-80">{{ p.price }}{{ currencySymbol(p.currency) }}</span>
                </div>
              </div>
            </template>

            <div v-if="liveRect" class="absolute border-2 border-dashed border-yellow-400 bg-yellow-400/10 pointer-events-none rounded"
              :style="{ left: liveRect.x+'%', top: liveRect.y+'%', width: liveRect.w+'%', height: liveRect.h+'%' }" />
            <div v-if="pendingRect" class="absolute border-2 border-yellow-400 bg-yellow-400/15 pointer-events-none rounded"
              :style="{ left: pendingRect.x+'%', top: pendingRect.y+'%', width: pendingRect.w+'%', height: pendingRect.h+'%' }" />
          </div>
        </div>

        <!-- Right panel (full-screen) -->
        <div class="w-96 shrink-0 flex flex-col bg-gray-900 border-l border-gray-800">
          <!-- CATALOG (fullscreen) -->
          <template v-if="image.imageType === 'catalog'">
            <div class="flex items-center justify-between px-4 py-3 border-b border-gray-800">
              <span class="text-sm font-medium text-white">Products</span>
              <UButton v-if="authStore.isEditing" icon="i-heroicons-plus" size="xs" color="purple" variant="soft"
                @click="openQuickAdd">Add</UButton>
            </div>
            <div class="flex-1 overflow-y-auto p-3 space-y-2">
              <!-- Annotate form -->
              <div v-if="authStore.isEditing && pendingRect" class="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 space-y-2">
                <p class="text-xs font-medium text-yellow-400">Name this item:</p>
                <UInput v-model="annotateForm.name" placeholder="e.g. A3 Print" size="sm" autofocus />
                <div class="grid grid-cols-2 gap-2">
                  <UInput v-model="annotateForm.price" type="number" step="0.01" placeholder="Price" size="sm" />
                  <USelect v-model="annotateForm.currency" :options="currencyOptions" size="sm" />
                </div>
                <div v-if="presets?.length" class="flex flex-wrap gap-1">
                  <button v-for="preset in presets" :key="preset.id" type="button"
                    class="px-2 py-0.5 text-xs rounded-full border border-gray-600 text-gray-400 hover:border-purple-500 hover:text-purple-300 transition-colors"
                    @click="applyPreset(preset, annotateForm)">{{ preset.label }} {{ preset.price }}{{ preset.currency }}</button>
                </div>
                <USelect v-model="annotateForm.size" :options="sizeOptions" option-attribute="label" value-attribute="value" size="sm" />
                <UInput v-model="annotateForm.website" placeholder="Website URL" size="sm" />
                <div class="flex flex-wrap gap-1">
                  <button v-for="c in QUICK_CATS" :key="c" type="button"
                    class="px-1.5 py-0.5 text-xs rounded border transition-colors"
                    :class="annotateForm.category === c ? 'bg-purple-600 border-purple-500 text-white' : 'border-gray-700 text-gray-400 hover:border-gray-500'"
                    @click="annotateForm.category = annotateForm.category === c ? '' : c">{{ c }}</button>
                </div>
                <USelect v-model="annotateForm.personId" :options="personOptions" option-attribute="label" value-attribute="value" size="sm" />
                <div class="flex gap-2">
                  <UButton size="xs" color="purple" :disabled="!annotateForm.name.trim()" @click="saveAnnotation">Save</UButton>
                  <UButton size="xs" variant="ghost" color="gray" @click="cancelAnnotation">Cancel</UButton>
                </div>
              </div>
              <!-- Quick add form -->
              <div v-if="authStore.isEditing && showQuickAdd" class="bg-gray-800 rounded-lg p-3 space-y-2">
                <UInput v-model="quickForm.name" placeholder="Product name…" size="sm" autofocus />
                <div class="grid grid-cols-2 gap-2">
                  <UInput v-model="quickForm.price" type="number" step="0.01" placeholder="Price" size="sm" />
                  <USelect v-model="quickForm.currency" :options="currencyOptions" size="sm" />
                </div>
                <div v-if="presets?.length" class="flex flex-wrap gap-1">
                  <button v-for="preset in presets" :key="preset.id" type="button"
                    class="px-2 py-0.5 text-xs rounded-full border border-gray-600 text-gray-400 hover:border-purple-500 hover:text-purple-300 transition-colors"
                    @click="applyPreset(preset, quickForm)">{{ preset.label }} {{ preset.price }}{{ preset.currency }}</button>
                </div>
                <USelect v-model="quickForm.size" :options="sizeOptions" option-attribute="label" value-attribute="value" size="sm" />
                <UInput v-model="quickForm.website" placeholder="Website URL" size="sm" />
                <div class="flex flex-wrap gap-1">
                  <button v-for="c in QUICK_CATS" :key="c" type="button"
                    class="px-1.5 py-0.5 text-xs rounded border transition-colors"
                    :class="quickForm.category === c ? 'bg-purple-600 border-purple-500 text-white' : 'border-gray-700 text-gray-400 hover:border-gray-500'"
                    @click="quickForm.category = quickForm.category === c ? '' : c">{{ c }}</button>
                </div>
                <USelect v-model="quickForm.personId" :options="personOptions" option-attribute="label" value-attribute="value" size="sm" />
                <div class="flex gap-2">
                  <UButton size="xs" color="purple" :disabled="!quickForm.name.trim()" @click="saveQuickAdd">Save</UButton>
                  <UButton size="xs" variant="ghost" color="gray" @click="showQuickAdd = false">Cancel</UButton>
                </div>
              </div>

              <!-- Product list with inline editing (fullscreen) -->
              <template v-for="product in products" :key="`fs-${product.id}`">
                <div v-if="editingProductId === product.id" class="bg-gray-800 border border-purple-600/40 rounded-lg p-3 space-y-2">
                  <UInput v-model="editProductForm.name" placeholder="Product name" size="sm" autofocus />
                  <div class="grid grid-cols-2 gap-2">
                    <UInput v-model="editProductForm.price" type="number" step="0.01" placeholder="Price" size="sm" />
                    <USelect v-model="editProductForm.currency" :options="currencyOptions" size="sm" />
                  </div>
                  <div v-if="presets?.length" class="flex flex-wrap gap-1">
                    <button v-for="preset in presets" :key="preset.id" type="button"
                      class="px-2 py-0.5 text-xs rounded-full border border-gray-600 text-gray-400 hover:border-purple-500 hover:text-purple-300 transition-colors"
                      @click="applyPreset(preset, editProductForm)">{{ preset.label }} {{ preset.price }}{{ preset.currency }}</button>
                  </div>
                  <USelect v-model="editProductForm.size" :options="sizeOptions" option-attribute="label" value-attribute="value" size="sm" />
                  <UInput v-model="editProductForm.website" placeholder="Website URL" size="sm" />
                  <div class="flex flex-wrap gap-1">
                    <button v-for="c in QUICK_CATS" :key="c" type="button"
                      class="px-1.5 py-0.5 text-xs rounded border transition-colors"
                      :class="editProductForm.category === c ? 'bg-purple-600 border-purple-500 text-white' : 'border-gray-700 text-gray-400 hover:border-gray-500'"
                      @click="editProductForm.category = editProductForm.category === c ? '' : c">{{ c }}</button>
                  </div>
                  <USelect v-model="editProductForm.personId" :options="personOptions" option-attribute="label" value-attribute="value" size="sm" />
                  <div class="flex gap-2">
                    <UButton size="xs" color="purple" :disabled="!editProductForm.name.trim()" @click="saveEditProduct(product.id)">Save</UButton>
                    <UButton size="xs" variant="ghost" color="gray" @click="cancelEditProduct">Cancel</UButton>
                  </div>
                </div>
                <div v-else
                  class="flex items-center gap-1 group"
                  :class="hoveredProductId === product.id ? 'ring-1 ring-purple-400 rounded-lg' : ''"
                  @mouseenter="hoveredProductId = product.id"
                  @mouseleave="hoveredProductId = null"
                >
                  <ProductItem
                    :product="product"
                    class="flex-1"
                    @toggle="store.togglePurchased(product)"
                    @delete="store.deleteProduct(product.id)"
                  />
                  <UButton
                    v-if="authStore.isEditing"
                    icon="i-heroicons-pencil-square"
                    variant="ghost" color="gray" size="xs"
                    class="opacity-0 group-hover:opacity-100 shrink-0"
                    @click="startEditProduct(product)"
                  />
                </div>
              </template>

              <p v-if="!products.length && !pendingRect && !showQuickAdd" class="text-gray-600 text-sm text-center py-8">
                <span v-if="authStore.isEditing">Enable Drawing and drag to mark items</span>
                <span v-else>No products linked</span>
              </p>
            </div>
          </template>

          <!-- ARTICLE (fullscreen) -->
          <template v-else-if="image.imageType === 'article'">
            <div class="flex items-center justify-between px-4 py-3 border-b border-gray-800">
              <span class="text-sm font-medium text-white">Price Sources</span>
              <UButton v-if="authStore.isEditing" icon="i-heroicons-plus" size="xs" color="orange" variant="soft"
                @click="openAddSource">Add</UButton>
            </div>
            <div class="flex-1 overflow-y-auto p-3 space-y-2">
              <div v-if="authStore.isEditing && showAddSource" class="bg-gray-800 rounded-lg p-3 space-y-2">
                <UInput v-model="sourceForm.name" placeholder="Shop / Source name" size="sm" autofocus />
                <div class="grid grid-cols-2 gap-2">
                  <UInput v-model="sourceForm.price" type="number" step="0.01" placeholder="Price" size="sm" />
                  <USelect v-model="sourceForm.currency" :options="currencyOptions" size="sm" />
                </div>
                <div v-if="presets?.length" class="flex flex-wrap gap-1">
                  <button v-for="preset in presets" :key="preset.id" type="button"
                    class="px-2 py-0.5 text-xs rounded-full border border-gray-600 text-gray-400 hover:border-orange-500 hover:text-orange-300 transition-colors"
                    @click="applyPreset(preset, sourceForm)">{{ preset.label }} {{ preset.price }}{{ preset.currency }}</button>
                </div>
                <UInput v-model="sourceForm.website" placeholder="Website URL (optional)" size="sm" />
                <UTextarea v-model="sourceForm.notes" placeholder="Notes (optional)…" size="sm" :rows="2" />
                <USelect v-model="sourceForm.personId" :options="personOptions" option-attribute="label" value-attribute="value" size="sm" />
                <div class="flex gap-2">
                  <UButton size="xs" color="orange" :disabled="!sourceForm.name.trim()" @click="saveSource">Save</UButton>
                  <UButton size="xs" variant="ghost" color="gray" @click="showAddSource = false">Cancel</UButton>
                </div>
              </div>

              <div v-for="p in products" :key="`fs-source-${p.id}`"
                class="border rounded-lg overflow-hidden transition-colors"
                :class="p.isPurchased ? 'border-green-500/40 bg-green-900/10' : 'border-gray-700 bg-gray-800'"
              >
                <div class="flex items-center gap-2 px-3 py-2">
                  <div class="flex-1 min-w-0 cursor-pointer" @click="toggleSourceExpand(p.id)">
                    <div class="flex items-center gap-2">
                      <span
                        v-if="personById(p.personId)"
                        :class="['w-2 h-2 rounded-full shrink-0', COLOR_MAP[personById(p.personId)!.color] ?? 'bg-purple-500']"
                      />
                      <span class="text-sm text-white">{{ p.name }}</span>
                      <span v-if="personById(p.personId)" class="text-xs text-gray-500">{{ personById(p.personId)!.name }}</span>
                    </div>
                    <div v-if="p.price" class="flex items-center gap-1.5 mt-0.5">
                      <span class="text-sm font-semibold" :class="p.isPurchased ? 'text-green-400' : 'text-yellow-400'">
                        {{ p.price.toFixed(2) }} {{ currencySymbol(p.currency) }}
                      </span>
                    </div>
                  </div>
                  <UButton
                    :icon="expandedSourceId === p.id ? 'i-heroicons-chevron-up' : 'i-heroicons-chevron-down'"
                    variant="ghost" color="gray" size="xs"
                    @click="toggleSourceExpand(p.id)"
                  />
                  <button type="button"
                    class="text-xs px-2 py-1 rounded-full border transition-all font-medium shrink-0"
                    :class="p.isPurchased ? 'bg-green-600 border-green-500 text-white' : 'border-gray-600 text-gray-400 hover:border-green-500 hover:text-green-400'"
                    @click="markAsPaid(p)">{{ p.isPurchased ? '✓ Paid' : 'Paid?' }}</button>
                  <UButton v-if="authStore.isEditing" icon="i-heroicons-trash" variant="ghost" color="red" size="xs" @click="store.deleteProduct(p.id)" />
                </div>
                <div v-if="expandedSourceId === p.id" class="border-t border-gray-700 px-3 py-3">
                  <div v-if="authStore.isEditing && editingSourceId === p.id" class="space-y-2">
                    <UInput v-model="editSourceForm.name" placeholder="Source name" size="sm" autofocus />
                    <div class="grid grid-cols-2 gap-2">
                      <UInput v-model="editSourceForm.price" type="number" step="0.01" placeholder="Price" size="sm" />
                      <USelect v-model="editSourceForm.currency" :options="currencyOptions" size="sm" />
                    </div>
                    <UInput v-model="editSourceForm.website" placeholder="Website URL" size="sm" />
                    <UTextarea v-model="editSourceForm.notes" placeholder="Notes…" size="sm" :rows="2" />
                    <USelect v-model="editSourceForm.personId" :options="personOptions" option-attribute="label" value-attribute="value" size="sm" />
                    <div class="flex gap-2">
                      <UButton size="xs" color="purple" :disabled="!editSourceForm.name.trim()" @click="saveEditSource(p.id)">Save</UButton>
                      <UButton size="xs" variant="ghost" color="gray" @click="cancelEditSource">Cancel</UButton>
                    </div>
                  </div>
                  <div v-else class="space-y-2">
                    <a v-if="p.website" :href="p.website" target="_blank"
                      class="flex items-center gap-1.5 text-blue-400 hover:text-blue-300 text-sm break-all">
                      <UIcon name="i-heroicons-arrow-top-right-on-square" class="w-4 h-4 shrink-0" />
                      {{ p.website }}
                    </a>
                    <p v-if="p.notes" class="text-sm text-gray-400 leading-relaxed whitespace-pre-wrap">{{ p.notes }}</p>
                    <p v-if="!p.website && !p.notes" class="text-xs text-gray-600 italic">No additional info.</p>
                    <UButton v-if="authStore.isEditing" size="xs" variant="soft" color="gray" icon="i-heroicons-pencil-square" @click="startEditSource(p)">Edit</UButton>
                  </div>
                </div>
              </div>

              <div v-if="paidSource" class="p-2 bg-green-900/20 border border-green-700/30 rounded-lg">
                <div class="text-xs text-gray-400">Paid:</div>
                <div class="text-sm font-medium text-white">{{ paidSource.name }}</div>
                <div v-if="paidSource.price" class="text-sm font-bold text-green-400">
                  {{ paidSource.price.toFixed(2) }} {{ currencySymbol(paidSource.currency) }}
                </div>
              </div>
              <p v-if="!products.length && !showAddSource" class="text-gray-600 text-sm text-center py-8">
                Add price sources to compare
              </p>
            </div>
          </template>

          <!-- RECEIPT (fullscreen) -->
          <template v-else>
            <div class="px-4 py-3 border-b border-gray-800">
              <span class="text-sm font-medium text-white">Mark as Purchased</span>
            </div>
            <div class="flex-1 overflow-y-auto p-3 space-y-1">
              <label v-for="p in receiptProducts" :key="`fs-receipt-${p.id}`"
                class="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-800 cursor-pointer transition-colors">
                <UCheckbox :model-value="p.isPurchased" @change="toggleReceiptProduct(p)" />
                <div class="flex-1 min-w-0">
                  <span :class="['text-sm', p.isPurchased ? 'line-through text-gray-500' : 'text-white']">{{ p.name }}</span>
                </div>
                <span v-if="p.price" :class="['text-sm font-medium shrink-0', p.isPurchased ? 'text-green-400' : 'text-yellow-400']">
                  {{ (p.price * p.quantity).toFixed(2) }} {{ p.currency }}
                </span>
              </label>
              <p v-if="!receiptProducts.length" class="text-gray-600 text-sm text-center py-8">No products in this booth</p>
            </div>
          </template>
        </div>
      </div>
    </div>
  </Teleport>
</template>
