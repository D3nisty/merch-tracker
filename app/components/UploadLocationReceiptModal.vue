<script setup lang="ts">
import { useEventsStore } from '~/stores/events'
import { useLocale } from '~/composables/useLocale'

const props = defineProps<{
  modelValue: boolean
  locationId: string
  locationName: string
}>()
const emit = defineEmits<{ 'update:modelValue': [v: boolean] }>()

const store = useEventsStore()
const { t } = useLocale()

const uploading = ref(false)
const uploadError = ref('')
const fileInput = ref<HTMLInputElement>()
const dragOver = ref(false)

const selectedFile = ref<File | null>(null)
const preview = ref<string | null>(null)

const customName = ref('')

type Geo = { latitude: number; longitude: number }
const useGeotag = ref(false)
const geotag = ref<Geo | null | undefined>(undefined)
const geotagLoading = ref(false)

function revokePreview() {
  if (preview.value) URL.revokeObjectURL(preview.value)
  preview.value = null
}

function resetState() {
  revokePreview()
  selectedFile.value = null
  customName.value = ''
  uploadError.value = ''
  geotag.value = undefined
  geotagLoading.value = false
  useGeotag.value = false
}

watch(() => props.modelValue, (open) => {
  if (!open) resetState()
})

onBeforeUnmount(revokePreview)

async function readGpsFromFile(file: File): Promise<Geo | null> {
  try {
    const exifr = (await import('exifr')).default as { gps?: (input: File | Blob) => Promise<{ latitude?: number; longitude?: number } | null | undefined> }
    if (!exifr?.gps) return null
    const result = await exifr.gps(file)
    if (!result || typeof result.latitude !== 'number' || typeof result.longitude !== 'number') return null
    if (!Number.isFinite(result.latitude) || !Number.isFinite(result.longitude)) return null
    return { latitude: result.latitude, longitude: result.longitude }
  } catch {
    return null
  }
}

async function extractGeoIfNeeded() {
  if (!useGeotag.value || !selectedFile.value || geotag.value !== undefined) return
  geotagLoading.value = true
  try {
    geotag.value = await readGpsFromFile(selectedFile.value)
  } finally {
    geotagLoading.value = false
  }
}

watch(useGeotag, (on) => {
  if (on) void extractGeoIfNeeded()
})

function onFileSelect(files: FileList | null, inputEl?: HTMLInputElement) {
  const file = files?.[0]
  if (file) {
    revokePreview()
    selectedFile.value = file
    preview.value = URL.createObjectURL(file)
    geotag.value = undefined
    uploadError.value = ''
    if (useGeotag.value) void extractGeoIfNeeded()
  }
  if (inputEl) inputEl.value = ''
}

function onDrop(e: DragEvent) {
  dragOver.value = false
  onFileSelect(e.dataTransfer?.files ?? null)
}

async function handleUpload() {
  if (!selectedFile.value) return
  uploading.value = true
  uploadError.value = ''
  try {
    await store.uploadLocationReceipt({
      locationId: props.locationId,
      file: selectedFile.value,
      customName: customName.value.trim() || undefined,
      latitude: useGeotag.value && geotag.value ? geotag.value.latitude : null,
      longitude: useGeotag.value && geotag.value ? geotag.value.longitude : null,
    })
    emit('update:modelValue', false)
  } catch (e: unknown) {
    const msg = (e as { data?: { message?: string }; message?: string })?.data?.message
      ?? (e as { message?: string })?.message
      ?? 'Unknown error'
    uploadError.value = `${t('upload.uploadFailed')}: ${msg}`
  } finally {
    uploading.value = false
  }
}
</script>

<template>
  <UModal :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)" :ui="{ width: 'sm:max-w-lg' }">
    <UCard>
      <template #header>
        <h3 class="font-semibold text-white">{{ t('upload.locationReceiptTitle') }} — {{ locationName }}</h3>
        <p class="text-sm text-gray-400 mt-1">{{ t('upload.locationReceiptDesc') }}</p>
      </template>

      <input
        ref="fileInput"
        type="file"
        accept="image/*"
        class="sr-only"
        tabindex="-1"
        aria-hidden="true"
        @change="onFileSelect(($event.target as HTMLInputElement).files, $event.target as HTMLInputElement)"
      />

      <div class="space-y-4">
        <UFormGroup :label="t('upload.receiptName')">
          <UInput v-model="customName" :placeholder="t('upload.receiptNamePlaceholder')" />
        </UFormGroup>

        <label class="flex items-start gap-2 p-3 rounded-lg border border-gray-800 bg-gray-900/50 cursor-pointer">
          <UCheckbox v-model="useGeotag" class="mt-0.5 shrink-0" />
          <div class="min-w-0 flex-1">
            <div class="text-sm text-white flex items-center gap-1.5">
              <UIcon name="i-heroicons-map-pin" class="w-4 h-4 text-purple-400 shrink-0" />
              {{ t('upload.extractGeotag') }}
            </div>
            <p class="text-xs text-gray-400 mt-0.5">{{ t('upload.extractGeotagHint') }}</p>
          </div>
        </label>

        <div
          v-if="!selectedFile"
          class="border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors"
          :class="dragOver ? 'border-green-400 bg-green-500/10' : 'border-gray-700 hover:border-gray-600'"
          @dragover.prevent="dragOver = true"
          @dragleave="dragOver = false"
          @drop.prevent="onDrop"
          @click="fileInput?.click()"
        >
          <UIcon name="i-heroicons-receipt-percent" class="w-10 h-10 mx-auto mb-3 text-gray-500" />
          <p class="text-white font-medium">{{ t('upload.dropImageHere') }}</p>
          <p class="text-sm text-gray-400 mt-1">{{ t('upload.imageFormats') }}</p>
        </div>

        <div v-else class="space-y-2">
          <div class="rounded-lg overflow-hidden border border-gray-700">
            <img v-if="preview" :src="preview" class="w-full max-h-[240px] object-contain bg-black" alt="" />
            <div class="flex items-center gap-2 px-3 py-2 bg-gray-900">
              <div class="flex-1 min-w-0">
                <div class="text-sm text-white truncate">{{ selectedFile.name }}</div>
                <div class="text-xs text-gray-500">{{ (selectedFile.size / 1024).toFixed(0) }} KB</div>
              </div>
              <UButton
                variant="ghost" color="gray" size="xs"
                icon="i-heroicons-x-mark"
                :disabled="uploading"
                @click="resetState"
              />
            </div>
            <div v-if="useGeotag" class="px-3 py-1.5 bg-gray-950 text-xs flex items-center gap-1 border-t border-gray-800">
              <template v-if="geotagLoading">
                <UIcon name="i-heroicons-arrow-path" class="w-3 h-3 animate-spin text-gray-500 shrink-0" />
                <span class="text-gray-500">{{ t('upload.geotagReading') }}</span>
              </template>
              <template v-else-if="geotag">
                <UIcon name="i-heroicons-map-pin" class="w-3 h-3 text-purple-400 shrink-0" />
                <span class="text-purple-300">{{ t('upload.geotagDetected') }}:</span>
                <span class="text-gray-400 truncate">{{ geotag.latitude.toFixed(5) }}, {{ geotag.longitude.toFixed(5) }}</span>
              </template>
              <template v-else-if="geotag === null">
                <UIcon name="i-heroicons-no-symbol" class="w-3 h-3 text-gray-600 shrink-0" />
                <span class="text-gray-500">{{ t('upload.geotagNone') }}</span>
              </template>
            </div>
          </div>
          <p v-if="uploadError" class="text-red-400 text-xs">{{ uploadError }}</p>
        </div>
      </div>

      <template #footer>
        <div class="flex gap-2 justify-end flex-wrap">
          <UButton variant="ghost" color="gray" @click="emit('update:modelValue', false)">{{ t('common.close') }}</UButton>
          <UButton
            color="green"
            :loading="uploading"
            :disabled="!selectedFile || uploading"
            icon="i-heroicons-arrow-up-tray"
            @click="handleUpload"
          >{{ t('common.upload') }}</UButton>
        </div>
      </template>
    </UCard>
  </UModal>
</template>
