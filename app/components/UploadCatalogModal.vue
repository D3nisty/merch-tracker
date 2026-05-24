<script setup lang="ts">
import { useEventsStore } from '~/stores/events'
import { usePersonsStore } from '~/stores/persons'
import { useLocale } from '~/composables/useLocale'
import type { CatalogImage } from '~/stores/events'

const props = defineProps<{
  modelValue: boolean
  boothId: string
}>()
const emit = defineEmits<{ 'update:modelValue': [v: boolean] }>()

const store = useEventsStore()
const personsStore = usePersonsStore()
const { t } = useLocale()
const uploading = ref(false)
const uploadProgress = ref({ current: 0, total: 0 })
const dragOver = ref(false)
const fileInput = ref<HTMLInputElement>()
const uploadError = ref('')

const source = ref<'file' | 'url'>('file')
const urlInput = ref('')
const urlError = ref('')

type Geo = { latitude: number; longitude: number }

const selectedFiles = ref<File[]>([])
const previews = ref<string[]>([])
// `undefined` = not yet processed, `null` = processed but no GPS found, Geo = success.
const geotags = ref<(Geo | null | undefined)[]>([])
const geotagLoading = ref<boolean[]>([])
const useGeotag = ref(false)

const form = reactive({
  customName: '',
  imageType: 'catalog' as 'catalog' | 'article' | 'receipt',
  displayMode: 'full' as 'full' | 'split',
  splitCount: 2,
  personId: '',
})

const isValidUrl = computed(() => /^https?:\/\/.+/i.test(urlInput.value.trim()))

const personOptions = computed(() => [
  { value: '', label: '— ' + t('booth.unassigned') + ' —' },
  ...personsStore.persons.map(p => ({ value: p.id, label: p.name })),
])

watch(() => form.imageType, (type) => {
  if (type === 'article' && !form.personId) {
    form.personId = personsStore.currentPersonId ?? ''
  }
})

function revokePreviews() {
  for (const url of previews.value) URL.revokeObjectURL(url)
  previews.value = []
}

function resetState() {
  revokePreviews()
  selectedFiles.value = []
  geotags.value = []
  geotagLoading.value = []
  uploadError.value = ''
  uploadProgress.value = { current: 0, total: 0 }
  form.customName = ''
}

const geotagSupported = computed(() => form.imageType === 'article' || form.imageType === 'receipt')

// Lazy-loaded EXIF GPS reader. Imported on first use so the ~10KB exifr
// bundle never runs at SSR and never hits the wire unless the user opts in.
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

async function extractGeoForIndex(idx: number) {
  const file = selectedFiles.value[idx]
  if (!file) return
  geotagLoading.value[idx] = true
  try {
    geotags.value[idx] = await readGpsFromFile(file)
  } finally {
    geotagLoading.value[idx] = false
  }
}

async function extractAllMissingGeo() {
  const tasks: Promise<void>[] = []
  for (let i = 0; i < selectedFiles.value.length; i++) {
    if (geotags.value[i] === undefined) {
      tasks.push(extractGeoForIndex(i))
    }
  }
  await Promise.all(tasks)
}

// When the user toggles the checkbox on with files already queued, fill in
// any missing readings. We don't clear cached results when toggling off — the
// upload step gates on `useGeotag` instead.
watch(useGeotag, (on) => {
  if (on && geotagSupported.value) void extractAllMissingGeo()
})

// Switching to catalog hides the checkbox; force it off so it doesn't silently
// stay on if the user toggles imageType back later.
watch(geotagSupported, (supported) => {
  if (!supported) useGeotag.value = false
})

watch(() => props.modelValue, (open) => {
  if (!open) resetState()
})

onBeforeUnmount(revokePreviews)

function onFileSelect(files: FileList | null, inputEl?: HTMLInputElement) {
  if (files?.length) {
    const startIdx = selectedFiles.value.length
    for (const file of Array.from(files)) {
      selectedFiles.value.push(file)
      previews.value.push(URL.createObjectURL(file))
      geotags.value.push(undefined)
      geotagLoading.value.push(false)
    }
    uploadError.value = ''
    if (useGeotag.value && geotagSupported.value) {
      for (let i = startIdx; i < selectedFiles.value.length; i++) void extractGeoForIndex(i)
    }
  }
  // Reset the input so picking the same file twice still fires `change`.
  if (inputEl) inputEl.value = ''
}

function removeSelected(idx: number) {
  const url = previews.value[idx]
  if (url) URL.revokeObjectURL(url)
  selectedFiles.value.splice(idx, 1)
  previews.value.splice(idx, 1)
  geotags.value.splice(idx, 1)
  geotagLoading.value.splice(idx, 1)
}

function onDrop(e: DragEvent) {
  dragOver.value = false
  onFileSelect(e.dataTransfer?.files ?? null)
}

async function handleUpload() {
  if (!selectedFiles.value.length) return
  uploading.value = true
  uploadError.value = ''
  uploadProgress.value = { current: 0, total: selectedFiles.value.length }
  try {
    for (let i = 0; i < selectedFiles.value.length; i++) {
      const file = selectedFiles.value[i]
      if (!file) continue
      uploadProgress.value.current = i + 1

      const fd = new FormData()
      fd.append('boothId', props.boothId)
      fd.append('image', file)
      fd.append('imageType', form.imageType)
      fd.append('displayMode', form.displayMode)
      fd.append('splitCount', String(form.splitCount))
      if (form.customName.trim()) fd.append('customName', form.customName.trim())
      if (form.imageType === 'article' && form.personId) fd.append('personId', form.personId)
      if (useGeotag.value && geotagSupported.value) {
        const geo = geotags.value[i]
        if (geo) {
          fd.append('latitude', String(geo.latitude))
          fd.append('longitude', String(geo.longitude))
        }
      }

      const result = await $fetch<CatalogImage>('/api/upload/image', {
        method: 'POST',
        body: fd,
      })

      if (store.currentEvent?.locations) {
        for (const loc of store.currentEvent.locations) {
          const booth = loc.booths?.find(b => b.id === props.boothId)
          if (booth) booth.images = [...(booth.images ?? []), result]
        }
      }
    }
    emit('update:modelValue', false)
  } catch (e: unknown) {
    const msg = (e as { data?: { message?: string }; message?: string })?.data?.message
      ?? (e as { message?: string })?.message
      ?? 'Unknown error'
    uploadError.value = `${t('upload.uploadFailed')}: ${msg}`
  } finally {
    uploading.value = false
    uploadProgress.value = { current: 0, total: 0 }
  }
}

async function handleUrl() {
  const url = urlInput.value.trim()
  if (!isValidUrl.value) {
    urlError.value = t('upload.urlInvalid')
    return
  }
  urlError.value = ''
  uploading.value = true
  try {
    await store.createImageFromUrl({
      boothId: props.boothId,
      url,
      customName: form.customName.trim() || undefined,
      imageType: form.imageType,
      displayMode: form.imageType === 'catalog' ? form.displayMode : undefined,
      splitCount: form.imageType === 'catalog' ? form.splitCount : undefined,
      personId: form.imageType === 'article' && form.personId ? form.personId : undefined,
    })
    emit('update:modelValue', false)
    form.customName = ''
    urlInput.value = ''
  } catch (e: unknown) {
    urlError.value = (e as { data?: { message?: string } })?.data?.message ?? 'Failed to add image'
  } finally {
    uploading.value = false
  }
}

const typeColor = computed(() => {
  if (form.imageType === 'article') return 'orange'
  if (form.imageType === 'receipt') return 'green'
  return 'purple'
})

const nameLabelComputed = computed(() => {
  if (form.imageType === 'article') return t('upload.articleName')
  if (form.imageType === 'receipt') return t('upload.receiptLabel')
  return t('upload.imageLabel')
})

const namePlaceholderComputed = computed(() => {
  if (form.imageType === 'article') return t('upload.articlePlaceholder')
  if (form.imageType === 'receipt') return t('upload.receiptPlaceholder')
  return t('upload.catalogPlaceholder')
})

const displayModeOptions = computed(() => [
  { value: 'full', label: t('upload.fullImage') },
  { value: 'split', label: t('upload.splitSections') },
])

const uploadButtonLabel = computed(() => {
  if (uploading.value && uploadProgress.value.total > 1) {
    return t('upload.uploadingProgress', {
      current: uploadProgress.value.current,
      total: uploadProgress.value.total,
    })
  }
  const n = selectedFiles.value.length
  return n > 0 ? `${t('common.upload')} (${n})` : t('common.upload')
})
</script>

<template>
  <UModal :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)" :ui="{ width: 'sm:max-w-lg' }">
    <UCard>
      <template #header>
        <h3 class="font-semibold text-white">{{ t('booth.uploadImage') }}</h3>
      </template>

      <!--
        Hidden file input — kept OUTSIDE the v-if drop-zone so its ref is stable
        across source-tab toggles. `sr-only` positions it offscreen rather than
        display:none, which some mobile webviews handle unreliably when the
        change event fires from a programmatic .click().
      -->
      <input
        ref="fileInput"
        type="file"
        multiple
        accept="image/*"
        class="sr-only"
        tabindex="-1"
        aria-hidden="true"
        @change="onFileSelect(($event.target as HTMLInputElement).files, $event.target as HTMLInputElement)"
      />

      <div class="space-y-4">
        <!-- Image type selection -->
        <UFormGroup :label="t('upload.whatImage')">
          <div class="grid grid-cols-3 gap-2">
            <button
              type="button"
              class="p-3 rounded-lg border-2 transition-all text-left"
              :class="form.imageType === 'catalog'
                ? 'border-purple-500 bg-purple-500/10'
                : 'border-gray-700 hover:border-gray-600'"
              @click="form.imageType = 'catalog'"
            >
              <UIcon name="i-heroicons-photo" class="w-5 h-5 mb-1" :class="form.imageType === 'catalog' ? 'text-purple-400' : 'text-gray-400'" />
              <div class="font-medium text-xs" :class="form.imageType === 'catalog' ? 'text-white' : 'text-gray-300'">{{ t('catalog.catalog') }}</div>
              <div class="text-xs text-gray-500 mt-0.5">{{ t('upload.multipleItems') }}</div>
            </button>
            <button
              type="button"
              class="p-3 rounded-lg border-2 transition-all text-left"
              :class="form.imageType === 'article'
                ? 'border-orange-500 bg-orange-500/10'
                : 'border-gray-700 hover:border-gray-600'"
              @click="form.imageType = 'article'"
            >
              <UIcon name="i-heroicons-cube" class="w-5 h-5 mb-1" :class="form.imageType === 'article' ? 'text-orange-400' : 'text-gray-400'" />
              <div class="font-medium text-xs" :class="form.imageType === 'article' ? 'text-white' : 'text-gray-300'">{{ t('catalog.article') }}</div>
              <div class="text-xs text-gray-500 mt-0.5">{{ t('upload.singleItem') }}</div>
            </button>
            <button
              type="button"
              class="p-3 rounded-lg border-2 transition-all text-left"
              :class="form.imageType === 'receipt'
                ? 'border-green-500 bg-green-500/10'
                : 'border-gray-700 hover:border-gray-600'"
              @click="form.imageType = 'receipt'"
            >
              <UIcon name="i-heroicons-receipt-percent" class="w-5 h-5 mb-1" :class="form.imageType === 'receipt' ? 'text-green-400' : 'text-gray-400'" />
              <div class="font-medium text-xs" :class="form.imageType === 'receipt' ? 'text-white' : 'text-gray-300'">{{ t('catalog.receipt') }}</div>
              <div class="text-xs text-gray-500 mt-0.5">{{ t('upload.markAsPaid') }}</div>
            </button>
          </div>
        </UFormGroup>

        <!-- Name -->
        <UFormGroup :label="nameLabelComputed">
          <UInput v-model="form.customName" :placeholder="namePlaceholderComputed" />
        </UFormGroup>

        <!-- Article: person assignment -->
        <UFormGroup v-if="form.imageType === 'article' && personOptions.length > 1" :label="t('upload.assignPerson')">
          <USelect v-model="form.personId" :options="personOptions" option-attribute="label" value-attribute="value" />
        </UFormGroup>

        <!-- Geotag: only meaningful for article/receipt photos taken on a phone -->
        <label
          v-if="geotagSupported && source === 'file'"
          class="flex items-start gap-2 p-3 rounded-lg border border-gray-800 bg-gray-900/50 cursor-pointer"
        >
          <UCheckbox v-model="useGeotag" class="mt-0.5 shrink-0" />
          <div class="min-w-0 flex-1">
            <div class="text-sm text-white flex items-center gap-1.5">
              <UIcon name="i-heroicons-map-pin" class="w-4 h-4 text-purple-400 shrink-0" />
              {{ t('upload.extractGeotag') }}
            </div>
            <p class="text-xs text-gray-400 mt-0.5">{{ t('upload.extractGeotagHint') }}</p>
          </div>
        </label>

        <!-- Source tabs: file vs URL -->
        <div class="flex gap-1 p-1 rounded-lg bg-gray-900 border border-gray-800">
          <button
            type="button"
            class="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors"
            :class="source === 'file' ? 'bg-gray-800 text-white' : 'text-gray-400 hover:text-white'"
            @click="source = 'file'"
          >
            <UIcon name="i-heroicons-arrow-up-tray" class="w-4 h-4" />
            {{ t('upload.sourceFile') }}
          </button>
          <button
            type="button"
            class="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors"
            :class="source === 'url' ? 'bg-gray-800 text-white' : 'text-gray-400 hover:text-white'"
            @click="source = 'url'"
          >
            <UIcon name="i-heroicons-link" class="w-4 h-4" />
            {{ t('upload.sourceUrl') }}
          </button>
        </div>

        <!-- Drop zone (file mode) -->
        <div
          v-if="source === 'file'"
          class="border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors"
          :class="dragOver ? 'border-purple-400 bg-purple-500/10' : 'border-gray-700 hover:border-gray-600'"
          @dragover.prevent="dragOver = true"
          @dragleave="dragOver = false"
          @drop.prevent="onDrop"
          @click="fileInput?.click()"
        >
          <UIcon name="i-heroicons-photo" class="w-10 h-10 mx-auto mb-3 text-gray-500" />
          <p class="text-white font-medium">{{ t('upload.dropImageHere') }}</p>
          <p class="text-sm text-gray-400 mt-1">{{ t('upload.imageFormats') }}</p>
        </div>

        <!-- Selected file previews (file mode) -->
        <div v-if="source === 'file' && selectedFiles.length" class="space-y-2">
          <div class="text-xs font-medium text-gray-400 uppercase tracking-wider">
            {{ t('upload.selectedFiles') }} ({{ selectedFiles.length }})
          </div>
          <ul class="space-y-2 max-h-64 overflow-y-auto pr-1">
            <li
              v-for="(file, idx) in selectedFiles"
              :key="`${file.name}-${idx}`"
              class="flex items-center gap-3 p-2 rounded-lg bg-gray-900 border border-gray-800"
            >
              <img
                v-if="previews[idx]"
                :src="previews[idx]"
                class="w-12 h-12 object-cover rounded shrink-0 bg-black"
                alt=""
              />
              <div class="flex-1 min-w-0">
                <div class="text-sm text-white truncate">{{ file.name }}</div>
                <div class="text-xs text-gray-500">{{ (file.size / 1024).toFixed(0) }} KB</div>
                <div v-if="useGeotag && geotagSupported" class="text-xs mt-0.5 flex items-center gap-1">
                  <template v-if="geotagLoading[idx]">
                    <UIcon name="i-heroicons-arrow-path" class="w-3 h-3 animate-spin text-gray-500 shrink-0" />
                    <span class="text-gray-500">{{ t('upload.geotagReading') }}</span>
                  </template>
                  <template v-else-if="geotags[idx]">
                    <UIcon name="i-heroicons-map-pin" class="w-3 h-3 text-purple-400 shrink-0" />
                    <span class="text-purple-300">{{ t('upload.geotagDetected') }}:</span>
                    <span class="text-gray-400 truncate">{{ geotags[idx]!.latitude.toFixed(5) }}, {{ geotags[idx]!.longitude.toFixed(5) }}</span>
                  </template>
                  <template v-else-if="geotags[idx] === null">
                    <UIcon name="i-heroicons-no-symbol" class="w-3 h-3 text-gray-600 shrink-0" />
                    <span class="text-gray-500">{{ t('upload.geotagNone') }}</span>
                  </template>
                </div>
              </div>
              <UButton
                variant="ghost"
                color="gray"
                size="xs"
                icon="i-heroicons-x-mark"
                :aria-label="t('upload.removeFile')"
                :disabled="uploading"
                @click="removeSelected(idx)"
              />
            </li>
          </ul>
          <p v-if="uploadError" class="text-red-400 text-xs">{{ uploadError }}</p>
        </div>

        <!-- URL input (url mode) -->
        <div v-if="source === 'url'" class="space-y-3">
          <UFormGroup :label="t('upload.imageUrl')">
            <UInput
              v-model="urlInput"
              :placeholder="t('upload.urlPlaceholder')"
              autofocus
              @keydown.enter.prevent="handleUrl"
            />
          </UFormGroup>
          <div v-if="isValidUrl" class="rounded-lg overflow-hidden border border-gray-700">
            <img :src="urlInput.trim()" class="w-full max-h-[240px] object-contain bg-black"
              @error="urlError = t('upload.urlInvalid')" />
            <div class="px-3 py-2 bg-gray-900 text-xs text-gray-500 truncate">{{ urlInput.trim() }}</div>
          </div>
          <p v-if="urlError" class="text-red-400 text-xs">{{ urlError }}</p>
        </div>

        <div v-if="form.imageType === 'catalog'" class="grid grid-cols-2 gap-3">
          <UFormGroup :label="t('upload.displayMode')">
            <USelect
              v-model="form.displayMode"
              :options="displayModeOptions"
              option-attribute="label" value-attribute="value"
            />
          </UFormGroup>
          <UFormGroup v-if="form.displayMode === 'split'" :label="t('upload.sections')">
            <UInput v-model.number="form.splitCount" type="number" min="2" max="10" />
          </UFormGroup>
        </div>
      </div>

      <template #footer>
        <div class="flex gap-2 justify-end flex-wrap">
          <UButton variant="ghost" color="gray" @click="emit('update:modelValue', false)">{{ t('common.close') }}</UButton>
          <UButton
            v-if="source === 'file'"
            :color="typeColor"
            :loading="uploading"
            :disabled="!selectedFiles.length || uploading"
            icon="i-heroicons-arrow-up-tray"
            @click="handleUpload"
          >{{ uploadButtonLabel }}</UButton>
          <UButton
            v-else
            :color="typeColor"
            :loading="uploading"
            :disabled="!isValidUrl"
            icon="i-heroicons-link"
            @click="handleUrl"
          >{{ t('upload.useUrl') }}</UButton>
        </div>
      </template>
    </UCard>
  </UModal>
</template>
