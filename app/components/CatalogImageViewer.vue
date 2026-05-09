<script setup lang="ts">
import type { CatalogImage, Product } from '~/stores/events'

const props = defineProps<{
  image: CatalogImage
  products: Product[]
}>()

const emit = defineEmits<{
  toggle: [product: Product]
  addProduct: [data: Partial<Product>]
  deleteProduct: [id: string]
}>()

const expanded = ref(true)
const fullscreen = ref(false)
const showOcr = ref(false)
const mode = ref(props.image.displayMode)
const splitCount = ref(props.image.splitCount ?? 2)

const splits = computed(() => {
  if (mode.value !== 'split') return []
  return Array.from({ length: splitCount.value }, (_, i) => i)
})

function splitStyle(index: number) {
  const pct = 100 / splitCount.value
  return { top: `${index * pct}%`, height: `${pct}%`, width: '100%' }
}

async function updateDisplayMode() {
  await $fetch(`/api/images/${props.image.id}`, {
    method: 'PUT',
    body: { displayMode: mode.value, splitCount: splitCount.value },
  })
}

// ── Close fullscreen on Escape ────────────────────────────────────────
onMounted(() => document.addEventListener('keydown', onKey))
onUnmounted(() => document.removeEventListener('keydown', onKey))
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    if (fullscreen.value) fullscreen.value = false
    else if (annotateMode.value) { annotateMode.value = false; cancelAnnotation() }
  }
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

const annotateForm = reactive({ name: '', price: '', category: '', size: '' })
const annotateSubmitting = ref(false)

// Quick-add form (no region, triggered by + Add button)
const showQuickAdd = ref(false)
const quickForm = reactive({ name: '', price: '', category: '', size: '' })

const QUICK_CATS = ['Print', 'Keychain', 'Sticker', 'Acrylic Figure', 'Figure', 'Mousepad', 'Shirt', 'Pin', 'Plush', 'Other']

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
  if (!annotateMode.value) return
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
  Object.assign(annotateForm, { name: '', price: '', category: '', size: '' })
}

function cancelAnnotation() {
  pendingRect.value = null
  liveRect.value = null
  drawStart.value = null
}

async function saveAnnotation() {
  if (!pendingRect.value || !annotateForm.name.trim()) return
  emit('addProduct', {
    catalogImageId: props.image.id,
    name: annotateForm.name.trim(),
    price: annotateForm.price ? Number(annotateForm.price) : undefined,
    category: annotateForm.category || undefined,
    size: annotateForm.size || undefined,
    regionX: pendingRect.value.x,
    regionY: pendingRect.value.y,
    regionW: pendingRect.value.w,
    regionH: pendingRect.value.h,
  })
  pendingRect.value = null
  Object.assign(annotateForm, { name: '', price: '', category: '', size: '' })
}

async function saveQuickAdd() {
  if (!quickForm.name.trim()) return
  emit('addProduct', {
    catalogImageId: props.image.id,
    name: quickForm.name.trim(),
    price: quickForm.price ? Number(quickForm.price) : undefined,
    category: quickForm.category || undefined,
    size: quickForm.size || undefined,
  })
  showQuickAdd.value = false
  Object.assign(quickForm, { name: '', price: '', category: '', size: '' })
}

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

function addFromOcr(item: { text: string; price: number | null }) {
  emit('addProduct', { catalogImageId: props.image.id, name: item.text.slice(0, 100), price: item.price ?? undefined })
}
</script>

<template>
  <div class="border border-gray-800 rounded-xl overflow-hidden">
    <!-- Header -->
    <div class="flex items-center justify-between px-4 py-3 bg-gray-900">
      <div class="flex items-center gap-2">
        <UButton
          :icon="expanded ? 'i-heroicons-chevron-down' : 'i-heroicons-chevron-right'"
          variant="ghost" color="gray" size="xs"
          @click="expanded = !expanded"
        />
        <span class="font-medium text-white text-sm">{{ image.originalName }}</span>
        <UBadge :label="`${products.length} products`" variant="soft" color="gray" size="xs" />
      </div>

      <div class="flex items-center gap-2">
        <UButton
          icon="i-heroicons-pencil-square"
          variant="ghost"
          :color="annotateMode ? 'purple' : 'gray'"
          size="xs"
          @click="annotateMode = !annotateMode; if (!annotateMode) cancelAnnotation()"
        >{{ annotateMode ? 'Done' : 'Annotate' }}</UButton>

        <UButton
          icon="i-heroicons-arrows-pointing-out"
          variant="ghost"
          color="gray"
          size="xs"
          title="Open full-screen view for annotation"
          @click="fullscreen = true"
        />

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
          title="Extract prices with OCR"
          :loading="ocrRunning"
          @click="runOcr"
        />
      </div>
    </div>

    <div v-show="expanded">
      <!-- Annotate hint -->
      <div v-if="annotateMode" class="px-4 py-2 bg-purple-900/30 border-b border-purple-700/40 text-xs text-purple-300 flex items-center gap-2">
        <UIcon name="i-heroicons-pencil-square" class="w-3.5 h-3.5 shrink-0" />
        Drag a rectangle on the image to mark an item.
        <UButton size="xs" variant="link" color="purple" @click="fullscreen = true">Open full-screen for better accuracy ↗</UButton>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-0">
        <!-- Image (compact) -->
        <div
          class="relative bg-black select-none"
          :class="annotateMode ? 'cursor-crosshair' : ''"
          @mousedown="onImgMouseDown"
          @mousemove="onImgMouseMove"
          @mouseup="onImgMouseUp"
          @mouseleave="drawStart = null; liveRect = null"
        >
          <img ref="imgRef" :src="image.path" class="w-full h-auto block" draggable="false" />

          <!-- Split overlays -->
          <template v-if="mode === 'split'">
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

          <!-- Existing regions -->
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

          <!-- Live draw -->
          <div v-if="liveRect" class="absolute border-2 border-dashed border-yellow-400 bg-yellow-400/10 pointer-events-none rounded"
            :style="{ left: liveRect.x+'%', top: liveRect.y+'%', width: liveRect.w+'%', height: liveRect.h+'%' }" />
          <div v-if="pendingRect" class="absolute border-2 border-yellow-400 bg-yellow-400/15 pointer-events-none rounded"
            :style="{ left: pendingRect.x+'%', top: pendingRect.y+'%', width: pendingRect.w+'%', height: pendingRect.h+'%' }" />
        </div>

        <!-- Products panel -->
        <div class="p-4 space-y-2 bg-gray-950 max-h-[600px] overflow-y-auto">
          <div class="flex items-center justify-between mb-3">
            <span class="text-sm font-medium text-gray-300">Products from this image</span>
            <UButton icon="i-heroicons-plus" size="xs" color="purple" variant="soft"
              @click="showQuickAdd = !showQuickAdd; pendingRect = null">Add</UButton>
          </div>

          <!-- Quick-add form (no region) -->
          <div v-if="showQuickAdd" class="bg-gray-800 rounded-lg p-3 space-y-2">
            <UInput v-model="quickForm.name" placeholder="Product name…" size="sm" autofocus />
            <div class="grid grid-cols-2 gap-2">
              <UInput v-model="quickForm.price" type="number" step="0.01" placeholder="Price" size="sm" />
              <UInput v-model="quickForm.size" placeholder="Size (A3, 25cm…)" size="sm" />
            </div>
            <div class="flex flex-wrap gap-1">
              <button v-for="c in QUICK_CATS" :key="c" type="button"
                class="px-1.5 py-0.5 text-xs rounded border transition-colors"
                :class="quickForm.category === c ? 'bg-purple-600 border-purple-500 text-white' : 'border-gray-700 text-gray-400 hover:border-gray-500'"
                @click="quickForm.category = quickForm.category === c ? '' : c">{{ c }}</button>
            </div>
            <div class="flex gap-2">
              <UButton size="xs" color="purple" :disabled="!quickForm.name.trim()" @click="saveQuickAdd">Save</UButton>
              <UButton size="xs" variant="ghost" color="gray" @click="showQuickAdd = false">Cancel</UButton>
            </div>
          </div>

          <!-- Annotation form (after drawing a rect) -->
          <div v-if="pendingRect" class="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 space-y-2">
            <p class="text-xs font-medium text-yellow-400 flex items-center gap-1">
              <UIcon name="i-heroicons-pencil-square" class="w-3.5 h-3.5" />
              Name this marked item:
            </p>
            <UInput v-model="annotateForm.name" placeholder="e.g. Cherry Blossom A3 Print" size="sm" autofocus />
            <div class="grid grid-cols-2 gap-2">
              <UInput v-model="annotateForm.price" type="number" step="0.01" placeholder="Price" size="sm" />
              <UInput v-model="annotateForm.size" placeholder="Size (e.g. A3, 25cm)" size="sm" />
            </div>
            <div class="flex flex-wrap gap-1">
              <button v-for="c in QUICK_CATS" :key="c" type="button"
                class="px-1.5 py-0.5 text-xs rounded border transition-colors"
                :class="annotateForm.category === c ? 'bg-purple-600 border-purple-500 text-white' : 'border-gray-700 text-gray-400 hover:border-gray-500'"
                @click="annotateForm.category = annotateForm.category === c ? '' : c">{{ c }}</button>
            </div>
            <div class="flex gap-2">
              <UButton size="xs" color="purple" :disabled="!annotateForm.name.trim()" @click="saveAnnotation">Save</UButton>
              <UButton size="xs" variant="ghost" color="gray" @click="cancelAnnotation">Cancel</UButton>
            </div>
          </div>

          <ProductItem
            v-for="product in products" :key="product.id"
            :product="product"
            :class="hoveredProductId === product.id ? 'ring-1 ring-purple-400 rounded-lg' : ''"
            @toggle="emit('toggle', product)"
            @delete="emit('deleteProduct', product.id)"
            @mouseenter="hoveredProductId = product.id"
            @mouseleave="hoveredProductId = null"
          />

          <p v-if="!products.length && !pendingRect && !showQuickAdd" class="text-gray-600 text-sm text-center py-4">
            No products linked yet. Use <span class="text-purple-400">Annotate</span> to mark items on the image.
          </p>

          <!-- OCR results -->
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
      </div>
    </div>
  </div>

  <!-- ── Full-screen annotation overlay ──────────────────────────────── -->
  <Teleport to="body">
    <div
      v-if="fullscreen"
      class="fixed inset-0 z-50 bg-gray-950 flex flex-col"
      style="overscroll-behavior: none"
    >
      <!-- Toolbar -->
      <div class="flex items-center gap-3 px-4 py-3 bg-gray-900 border-b border-gray-800 shrink-0">
        <UButton icon="i-heroicons-x-mark" variant="ghost" color="gray" size="sm" @click="fullscreen = false">
          Close
        </UButton>
        <span class="text-white font-medium text-sm">{{ image.originalName }}</span>
        <UButton
          icon="i-heroicons-pencil-square"
          :color="annotateMode ? 'purple' : 'gray'"
          variant="outline"
          size="sm"
          @click="annotateMode = !annotateMode; if (!annotateMode) cancelAnnotation()"
        >{{ annotateMode ? 'Drawing mode ON — drag to mark' : 'Enable Drawing' }}</UButton>
        <span v-if="annotateMode" class="text-xs text-purple-400">Drag a rectangle on the image · Press Esc to cancel</span>
        <span class="ml-auto text-xs text-gray-500">{{ products.length }} products</span>
      </div>

      <!-- Content: image left, products right -->
      <div class="flex flex-1 min-h-0">
        <!-- Scrollable image -->
        <div
          class="flex-1 overflow-auto bg-black select-none relative"
          :class="annotateMode ? 'cursor-crosshair' : 'cursor-default'"
          @mousedown="onImgMouseDown"
          @mousemove="onImgMouseMove"
          @mouseup="onImgMouseUp"
          @mouseleave="drawStart = null; liveRect = null"
        >
          <div class="relative inline-block min-w-full">
            <img
              ref="fsImgRef"
              :src="image.path"
              class="w-full h-auto block"
              draggable="false"
            />

            <!-- Existing regions -->
            <div v-for="p in regionProducts" :key="`fs-region-${p.id}`"
              class="absolute pointer-events-auto group/r"
              :style="regionStyle(p)"
              @mouseenter="hoveredProductId = p.id"
              @mouseleave="hoveredProductId = null"
            >
              <div class="absolute inset-0 border-2 rounded transition-all"
                :class="[
                  p.isPurchased ? 'border-green-400' : 'border-purple-400',
                  hoveredProductId === p.id ? 'bg-purple-400/25' : 'bg-purple-400/05',
                ]" />
              <div class="absolute top-0 left-0 text-sm font-semibold px-1.5 py-0.5 rounded-br leading-tight pointer-events-none"
                :class="p.isPurchased ? 'bg-green-600/90 text-white' : 'bg-purple-600/90 text-white'">
                {{ p.name }}
                <span v-if="p.price" class="ml-1 font-normal opacity-80">{{ p.price }}€</span>
              </div>
            </div>

            <!-- Live draw -->
            <div v-if="liveRect" class="absolute border-2 border-dashed border-yellow-400 bg-yellow-400/10 pointer-events-none rounded"
              :style="{ left: liveRect.x+'%', top: liveRect.y+'%', width: liveRect.w+'%', height: liveRect.h+'%' }" />
            <div v-if="pendingRect" class="absolute border-2 border-yellow-400 bg-yellow-400/15 pointer-events-none rounded"
              :style="{ left: pendingRect.x+'%', top: pendingRect.y+'%', width: pendingRect.w+'%', height: pendingRect.h+'%' }" />
          </div>
        </div>

        <!-- Products panel (fixed right) -->
        <div class="w-80 shrink-0 flex flex-col bg-gray-900 border-l border-gray-800">
          <div class="flex items-center justify-between px-4 py-3 border-b border-gray-800">
            <span class="text-sm font-medium text-white">Products</span>
            <UButton icon="i-heroicons-plus" size="xs" color="purple" variant="soft"
              @click="showQuickAdd = !showQuickAdd; pendingRect = null">Add</UButton>
          </div>

          <div class="flex-1 overflow-y-auto p-3 space-y-2">
            <!-- Annotation form -->
            <div v-if="pendingRect" class="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 space-y-2">
              <p class="text-xs font-medium text-yellow-400">Name this item:</p>
              <UInput v-model="annotateForm.name" placeholder="e.g. A3 Print" size="sm" autofocus />
              <div class="grid grid-cols-2 gap-2">
                <UInput v-model="annotateForm.price" type="number" step="0.01" placeholder="Price" size="sm" />
                <UInput v-model="annotateForm.size" placeholder="Size" size="sm" />
              </div>
              <div class="flex flex-wrap gap-1">
                <button v-for="c in QUICK_CATS" :key="c" type="button"
                  class="px-1.5 py-0.5 text-xs rounded border transition-colors"
                  :class="annotateForm.category === c ? 'bg-purple-600 border-purple-500 text-white' : 'border-gray-700 text-gray-400 hover:border-gray-500'"
                  @click="annotateForm.category = annotateForm.category === c ? '' : c">{{ c }}</button>
              </div>
              <div class="flex gap-2">
                <UButton size="xs" color="purple" :disabled="!annotateForm.name.trim()" @click="saveAnnotation">Save</UButton>
                <UButton size="xs" variant="ghost" color="gray" @click="cancelAnnotation">Cancel</UButton>
              </div>
            </div>

            <!-- Quick-add -->
            <div v-if="showQuickAdd" class="bg-gray-800 rounded-lg p-3 space-y-2">
              <UInput v-model="quickForm.name" placeholder="Product name…" size="sm" autofocus />
              <div class="grid grid-cols-2 gap-2">
                <UInput v-model="quickForm.price" type="number" step="0.01" placeholder="Price" size="sm" />
                <UInput v-model="quickForm.size" placeholder="Size" size="sm" />
              </div>
              <div class="flex flex-wrap gap-1">
                <button v-for="c in QUICK_CATS" :key="c" type="button"
                  class="px-1.5 py-0.5 text-xs rounded border transition-colors"
                  :class="quickForm.category === c ? 'bg-purple-600 border-purple-500 text-white' : 'border-gray-700 text-gray-400 hover:border-gray-500'"
                  @click="quickForm.category = quickForm.category === c ? '' : c">{{ c }}</button>
              </div>
              <div class="flex gap-2">
                <UButton size="xs" color="purple" :disabled="!quickForm.name.trim()" @click="saveQuickAdd">Save</UButton>
                <UButton size="xs" variant="ghost" color="gray" @click="showQuickAdd = false">Cancel</UButton>
              </div>
            </div>

            <ProductItem
              v-for="product in products" :key="`fs-${product.id}`"
              :product="product"
              :class="hoveredProductId === product.id ? 'ring-1 ring-purple-400 rounded-lg' : ''"
              @toggle="emit('toggle', product)"
              @delete="emit('deleteProduct', product.id)"
              @mouseenter="hoveredProductId = product.id"
              @mouseleave="hoveredProductId = null"
            />

            <p v-if="!products.length && !pendingRect && !showQuickAdd"
              class="text-gray-600 text-sm text-center py-8">
              Enable Drawing and drag to mark items
            </p>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
