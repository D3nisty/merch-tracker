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
const dragOver = ref(false)
const fileInput = ref<HTMLInputElement>()

const source = ref<'file' | 'url'>('file')
const urlInput = ref('')
const urlError = ref('')

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

async function handleFiles(files: FileList | null) {
  if (!files?.length) return
  uploading.value = true
  try {
    for (const file of Array.from(files)) {
      const fd = new FormData()
      fd.append('boothId', props.boothId)
      fd.append('image', file)
      fd.append('imageType', form.imageType)
      fd.append('displayMode', form.displayMode)
      fd.append('splitCount', String(form.splitCount))
      if (form.customName.trim()) fd.append('customName', form.customName.trim())
      if (form.imageType === 'article' && form.personId) fd.append('personId', form.personId)

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
    form.customName = ''
  } finally {
    uploading.value = false
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

function onDrop(e: DragEvent) {
  dragOver.value = false
  handleFiles(e.dataTransfer?.files ?? null)
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
</script>

<template>
  <UModal :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)" :ui="{ width: 'sm:max-w-lg' }">
    <UCard>
      <template #header>
        <h3 class="font-semibold text-white">{{ t('booth.uploadImage') }}</h3>
      </template>

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
          <input
            ref="fileInput"
            type="file"
            multiple
            accept="image/*"
            class="hidden"
            @change="handleFiles(($event.target as HTMLInputElement).files)"
          />
        </div>

        <!-- URL input (url mode) -->
        <div v-else class="space-y-3">
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
        <div class="flex gap-2 justify-end">
          <UButton variant="ghost" color="gray" @click="emit('update:modelValue', false)">{{ t('common.close') }}</UButton>
          <UButton
            v-if="source === 'file'"
            :color="typeColor"
            :loading="uploading"
            icon="i-heroicons-arrow-up-tray"
            @click="fileInput?.click()"
          >{{ t('common.upload') }}</UButton>
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
