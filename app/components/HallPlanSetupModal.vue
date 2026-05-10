<script setup lang="ts">
import { useEventsStore } from '~/stores/events'
import type { HallPlanImage, HallLayoutData, DetectedBooth } from '~/stores/events'
import { useLocale } from '~/composables/useLocale'

const props = defineProps<{
  modelValue: boolean
  locationId: string
  locationName: string
}>()
const emit = defineEmits<{ 'update:modelValue': [v: boolean] }>()

const store = useEventsStore()
const { t } = useLocale()

interface AnalyzedImage extends HallPlanImage {
  file?: File
  status: 'existing' | 'pending' | 'uploading' | 'analyzing' | 'done' | 'error'
  errorMsg?: string
  preview?: string
}

const images = ref<AnalyzedImage[]>([])
const saving = ref(false)
const fileInput = ref<HTMLInputElement>()

// Load existing layout when modal opens
watch(() => props.modelValue, (open) => {
  if (!open) return
  images.value = []
  const loc = store.currentEvent?.locations?.find(l => l.id === props.locationId)
  if (loc?.layoutData) {
    try {
      const layout: HallLayoutData = JSON.parse(loc.layoutData)
      for (const img of layout.images) {
        images.value.push({
          ...img,
          status: 'existing',
          preview: img.path,
        })
      }
    } catch {}
  }
}, { immediate: true })

// ── Booth number pattern ─────────────────────────────────────────
// Matches: "10L13", "L13", "K24", "10N02", "10M21" etc.
const BOOTH_PATTERN = /^(\d{1,2})?([A-Z]{1,2})(\d{2,3})$/i

function parseBoothText(text: string): string | null {
  const t = text.trim().replace(/\s+/g, '')
  if (BOOTH_PATTERN.test(t)) return t.toUpperCase()
  return null
}

// ── File handling ─────────────────────────────────────────────────
function onFilesSelected(files: FileList | null) {
  if (!files?.length) return
  for (const file of Array.from(files)) {
    if (!file.type.startsWith('image/')) continue
    const id = crypto.randomUUID()
    images.value.push({
      id,
      file,
      path: '',
      naturalWidth: 0,
      naturalHeight: 0,
      booths: [],
      status: 'pending',
      preview: URL.createObjectURL(file),
    })
  }
}

function removeImage(id: string) {
  images.value = images.value.filter(i => i.id !== id)
}

// ── Get natural image dimensions ──────────────────────────────────
function getImageDimensions(src: string): Promise<{ w: number; h: number }> {
  return new Promise(resolve => {
    const img = new Image()
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight })
    img.onerror = () => resolve({ w: 800, h: 1000 })
    img.src = src
  })
}

// ── Upload + OCR pipeline ─────────────────────────────────────────
async function analyzeAll() {
  saving.value = true
  try {
    const pendingImages = images.value.filter(i => i.status === 'pending' && i.file)

    if (pendingImages.length > 0) {
      const { createWorker } = await import('tesseract.js')
      const worker = await createWorker('eng', 1, {
        logger: () => {},
      })
      for (const img of pendingImages) {
        await processImage(img, worker)
      }
      await worker.terminate()
    }

    // Save existing + newly processed images (skip errors)
    const layoutData: HallLayoutData = {
      images: images.value
        .filter(i => i.status === 'existing' || i.status === 'done')
        .map(i => ({
          id: i.id,
          path: i.path,
          naturalWidth: i.naturalWidth,
          naturalHeight: i.naturalHeight,
          booths: i.booths,
        })),
    }

    await store.updateLocation(props.locationId, {
      layoutData: JSON.stringify(layoutData),
    })

    emit('update:modelValue', false)
  } catch (e) {
    console.error(e)
  } finally {
    saving.value = false
  }
}

async function processImage(img: AnalyzedImage, worker: import('tesseract.js').Worker) {
  img.status = 'uploading'
  try {
    // 1. Upload to server
    const fd = new FormData()
    fd.append('locationId', props.locationId)
    fd.append('image', img.file!)
    const result = await $fetch<{ path: string }>('/api/upload/floorplan', {
      method: 'POST',
      body: fd,
    })
    img.path = result.path

    // 2. Get natural dimensions
    const dims = await getImageDimensions(img.path)
    img.naturalWidth = dims.w
    img.naturalHeight = dims.h

    // 3. Run OCR
    img.status = 'analyzing'
    const { data } = await worker.recognize(img.path)

    // 4. Extract booth numbers with their positions
    const detected: DetectedBooth[] = []
    const seen = new Set<string>()

    type TWord = (typeof data.words)[number]
    interface Candidate { text: string; bbox: TWord['bbox'] }

    // Build candidates: individual words + adjacent pairs (OCR often splits "10N18" into "10N"+"18")
    const goodWords = data.words.filter(w => w.confidence >= 28)
    const candidates: Candidate[] = goodWords.map(w => ({ text: w.text, bbox: w.bbox }))

    for (let i = 0; i < goodWords.length - 1; i++) {
      const w1 = goodWords[i]
      const w2 = goodWords[i + 1]
      const midY1 = (w1.bbox.y0 + w1.bbox.y1) / 2
      const midY2 = (w2.bbox.y0 + w2.bbox.y1) / 2
      const lineHeight = w1.bbox.y1 - w1.bbox.y0
      const sameLine = Math.abs(midY1 - midY2) < lineHeight * 0.9
      const closeH = w2.bbox.x0 - w1.bbox.x1 < 24
      if (sameLine && closeH) {
        candidates.push({
          text: w1.text + w2.text,
          bbox: {
            x0: Math.min(w1.bbox.x0, w2.bbox.x0),
            y0: Math.min(w1.bbox.y0, w2.bbox.y0),
            x1: Math.max(w1.bbox.x1, w2.bbox.x1),
            y1: Math.max(w1.bbox.y1, w2.bbox.y1),
          },
        })
      }
    }

    for (const { text, bbox } of candidates) {
      const boothNr = parseBoothText(text)
      if (!boothNr || seen.has(boothNr)) continue
      seen.add(boothNr)
      const { x0, y0, x1, y1 } = bbox
      const padX = Math.round((x1 - x0) * 0.2)
      const padY = Math.round((y1 - y0) * 0.6)
      detected.push({
        boothNr,
        x: Math.max(0, x0 - padX),
        y: Math.max(0, y0 - padY),
        w: (x1 - x0) + padX * 2,
        h: (y1 - y0) + padY * 2,
      })
    }

    img.booths = detected
    img.status = 'done'
  } catch (e) {
    img.status = 'error'
    img.errorMsg = String(e)
  }
}

const totalDetected = computed(() => images.value.reduce((s, i) => s + i.booths.length, 0))
const savedImageCount = computed(() => images.value.filter(i => i.status === 'existing' || i.status === 'done').length)
const anyPending = computed(() => images.value.some(i => i.status === 'pending'))
const anyProcessing = computed(() => images.value.some(i => i.status === 'uploading' || i.status === 'analyzing'))
</script>

<template>
  <UModal
    :model-value="modelValue"
    @update:model-value="emit('update:modelValue', $event)"
    :ui="{ width: 'sm:max-w-3xl' }"
    :prevent-close="anyProcessing || saving"
  >
    <UCard>
      <template #header>
        <div>
          <h3 class="font-bold text-white text-lg">{{ t('hallSetup.title') }} — {{ locationName }}</h3>
          <p class="text-sm text-gray-400 mt-0.5">{{ t('hallSetup.description') }}</p>
        </div>
      </template>

      <div class="space-y-5">
        <!-- Drop zone -->
        <div
          class="border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors"
          :class="'border-gray-700 hover:border-purple-500'"
          @dragover.prevent
          @drop.prevent="onFilesSelected($event.dataTransfer?.files ?? null)"
          @click="fileInput?.click()"
        >
          <UIcon name="i-heroicons-map" class="w-8 h-8 mx-auto mb-2 text-gray-500" />
          <p class="text-white font-medium text-sm">{{ t('hallSetup.dropHere') }}</p>
          <p class="text-xs text-gray-400 mt-1">{{ t('hallSetup.dropHint') }}</p>
          <input ref="fileInput" type="file" accept="image/*" multiple class="hidden"
            @change="onFilesSelected(($event.target as HTMLInputElement).files)" />
        </div>

        <!-- Image list -->
        <div v-if="images.length" class="space-y-3">
          <div
            v-for="img in images"
            :key="img.id"
            class="flex items-center gap-3 bg-gray-900 rounded-xl p-3"
            :class="{ 'opacity-60': img.status === 'existing' }"
          >
            <!-- Thumbnail -->
            <div class="w-16 h-16 rounded-lg overflow-hidden bg-gray-800 shrink-0">
              <img v-if="img.preview" :src="img.preview" class="w-full h-full object-cover" />
            </div>

            <!-- Info -->
            <div class="flex-1 min-w-0">
              <div class="text-sm font-medium text-white truncate">
                <template v-if="img.status === 'existing'">{{ img.path.split('/').pop() }}</template>
                <template v-else>{{ img.file?.name }}</template>
              </div>
              <div class="text-xs text-gray-400 mt-0.5">
                <template v-if="img.status === 'existing'">
                  <span class="text-gray-500">
                    ✓ {{ img.booths.length }} {{ t('hallSetup.detected') }} · {{ t('hallSetup.alreadySaved') }}
                    <span v-if="img.naturalWidth" class="ml-1">({{ img.naturalWidth }}×{{ img.naturalHeight }}px)</span>
                  </span>
                </template>
                <template v-else-if="img.status === 'pending'">{{ t('hallSetup.readyToAnalyze') }}</template>
                <template v-else-if="img.status === 'uploading'">
                  <span class="text-blue-400">{{ t('hallSetup.uploading') }}</span>
                </template>
                <template v-else-if="img.status === 'analyzing'">
                  <span class="text-yellow-400 flex items-center gap-1">
                    <UIcon name="i-heroicons-cpu-chip" class="w-3 h-3 animate-pulse" />
                    {{ t('hallSetup.runningOcr') }}
                  </span>
                </template>
                <template v-else-if="img.status === 'done'">
                  <span class="text-green-400">
                    ✓ {{ img.booths.length }} {{ t('hallSetup.detected') }}
                    <span v-if="img.naturalWidth" class="text-gray-500 ml-1">({{ img.naturalWidth }}×{{ img.naturalHeight }}px)</span>
                  </span>
                </template>
                <template v-else-if="img.status === 'error'">
                  <span class="text-red-400">Error: {{ img.errorMsg }}</span>
                </template>
              </div>

              <!-- Detected booth chips (preview) -->
              <div v-if="(img.status === 'done' || img.status === 'existing') && img.booths.length" class="flex flex-wrap gap-1 mt-2">
                <span
                  v-for="b in img.booths.slice(0, 20)"
                  :key="b.boothNr"
                  class="text-xs font-mono px-1.5 py-0.5 rounded bg-gray-800 text-purple-300"
                >{{ b.boothNr }}</span>
                <span v-if="img.booths.length > 20" class="text-xs text-gray-500">
                  +{{ img.booths.length - 20 }} more
                </span>
              </div>
            </div>

            <!-- Status icon / remove -->
            <div class="shrink-0 flex items-center gap-1">
              <UIcon v-if="img.status === 'uploading' || img.status === 'analyzing'"
                name="i-heroicons-arrow-path"
                class="w-5 h-5 text-yellow-400 animate-spin"
              />
              <UIcon v-else-if="img.status === 'done'"
                name="i-heroicons-check-circle"
                class="w-5 h-5 text-green-400"
              />
              <UIcon v-else-if="img.status === 'error'"
                name="i-heroicons-x-circle"
                class="w-5 h-5 text-red-400"
              />
              <UButton
                v-if="!anyProcessing && img.status !== 'uploading' && img.status !== 'analyzing'"
                icon="i-heroicons-x-mark"
                variant="ghost"
                color="red"
                size="xs"
                @click="removeImage(img.id)"
              />
            </div>
          </div>
        </div>

        <!-- Summary -->
        <div v-if="totalDetected > 0" class="bg-purple-500/10 border border-purple-500/30 rounded-lg p-3 text-sm text-purple-300">
          <UIcon name="i-heroicons-check-circle" class="w-4 h-4 inline mr-1" />
          {{ totalDetected }} {{ t('hallSetup.detected') }} ({{ savedImageCount }})
        </div>

        <UAlert
          color="blue"
          :title="t('hallSetup.howItWorks')"
          :description="t('hallSetup.howItWorksDesc')"
        />
      </div>

      <template #footer>
        <div class="flex gap-2 justify-between items-center">
          <UButton variant="ghost" color="gray" @click="emit('update:modelValue', false)" :disabled="anyProcessing || saving">
            {{ t('common.cancel') }}
          </UButton>
          <div class="flex gap-2">
            <UButton
              v-if="anyPending"
              color="purple"
              icon="i-heroicons-cpu-chip"
              :loading="anyProcessing || saving"
              :disabled="anyProcessing"
              @click="analyzeAll"
            >
              {{ t('hallSetup.analyzeAndSave') }}
            </UButton>
            <UButton
              v-else
              color="green"
              icon="i-heroicons-check"
              :loading="saving"
              :disabled="saving"
              @click="analyzeAll"
            >
              {{ t('hallSetup.saveLayout') }}
            </UButton>
          </div>
        </div>
      </template>
    </UCard>
  </UModal>
</template>
