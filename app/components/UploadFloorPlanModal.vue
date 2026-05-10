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
const dragOver = ref(false)
const fileInput = ref<HTMLInputElement>()
const preview = ref<string | null>(null)
const selectedFile = ref<File | null>(null)

function onFileSelect(files: FileList | null) {
  if (!files?.length) return
  selectedFile.value = files[0]
  preview.value = URL.createObjectURL(files[0])
}

async function handleUpload() {
  if (!selectedFile.value) return
  uploading.value = true
  try {
    const fd = new FormData()
    fd.append('locationId', props.locationId)
    fd.append('image', selectedFile.value)

    const result = await $fetch<{ path: string }>('/api/upload/floorplan', {
      method: 'POST',
      body: fd,
    })

    await store.updateLocation(props.locationId, { floorPlanImage: result.path })
    emit('update:modelValue', false)
    preview.value = null
    selectedFile.value = null
  } finally {
    uploading.value = false
  }
}
</script>

<template>
  <UModal :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)" :ui="{ width: 'sm:max-w-2xl' }">
    <UCard>
      <template #header>
        <h3 class="font-semibold text-white">{{ t('upload.floorPlanTitle') }} — {{ locationName }}</h3>
        <p class="text-sm text-gray-400 mt-1">{{ t('upload.floorPlanDesc') }}</p>
      </template>

      <div class="space-y-4">
        <div
          class="border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors"
          :class="dragOver ? 'border-purple-400 bg-purple-500/10' : 'border-gray-700 hover:border-gray-600'"
          @dragover.prevent="dragOver = true"
          @dragleave="dragOver = false"
          @drop.prevent="e => onFileSelect(e.dataTransfer?.files ?? null)"
          @click="fileInput?.click()"
        >
          <UIcon name="i-heroicons-map" class="w-10 h-10 mx-auto mb-3 text-gray-500" />
          <p class="text-white font-medium">{{ t('upload.dropFloorPlan') }}</p>
          <p class="text-sm text-gray-400 mt-1">{{ t('upload.floorPlanFormats') }}</p>
          <input
            ref="fileInput"
            type="file"
            accept="image/*"
            class="hidden"
            @change="onFileSelect(($event.target as HTMLInputElement).files)"
          />
        </div>

        <div v-if="preview" class="rounded-lg overflow-hidden border border-gray-700">
          <img :src="preview" class="w-full max-h-[300px] object-contain bg-black" />
          <div class="px-3 py-2 bg-gray-900 text-xs text-gray-400">{{ selectedFile?.name }}</div>
        </div>
      </div>

      <template #footer>
        <div class="flex gap-2 justify-end">
          <UButton variant="ghost" color="gray" @click="emit('update:modelValue', false)">{{ t('common.cancel') }}</UButton>
          <UButton
            color="purple"
            :loading="uploading"
            :disabled="!selectedFile"
            icon="i-heroicons-arrow-up-tray"
            @click="handleUpload"
          >
            {{ t('upload.uploadFloorPlan') }}
          </UButton>
        </div>
      </template>
    </UCard>
  </UModal>
</template>
