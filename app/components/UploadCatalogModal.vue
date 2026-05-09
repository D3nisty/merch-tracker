<script setup lang="ts">
import { useEventsStore } from '~/stores/events'
import type { CatalogImage } from '~/stores/events'

const props = defineProps<{
  modelValue: boolean
  boothId: string
}>()
const emit = defineEmits<{ 'update:modelValue': [v: boolean] }>()

const store = useEventsStore()
const uploading = ref(false)
const dragOver = ref(false)
const fileInput = ref<HTMLInputElement>()

const form = reactive({
  displayMode: 'full' as 'full' | 'split',
  splitCount: 2,
})

async function handleFiles(files: FileList | null) {
  if (!files?.length) return
  uploading.value = true
  try {
    for (const file of Array.from(files)) {
      const fd = new FormData()
      fd.append('boothId', props.boothId)
      fd.append('image', file)
      fd.append('displayMode', form.displayMode)
      fd.append('splitCount', String(form.splitCount))

      const result = await $fetch<CatalogImage>('/api/upload/image', {
        method: 'POST',
        body: fd,
      })

      // Update local store
      if (store.currentEvent?.locations) {
        for (const loc of store.currentEvent.locations) {
          const booth = loc.booths?.find(b => b.id === props.boothId)
          if (booth) {
            booth.images = [...(booth.images ?? []), result]
          }
        }
      }
    }
    emit('update:modelValue', false)
  } finally {
    uploading.value = false
  }
}

function onDrop(e: DragEvent) {
  dragOver.value = false
  handleFiles(e.dataTransfer?.files ?? null)
}
</script>

<template>
  <UModal :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)" :ui="{ width: 'sm:max-w-lg' }">
    <UCard>
      <template #header>
        <h3 class="font-semibold text-white">Upload Catalog Images</h3>
      </template>

      <div class="space-y-4">
        <!-- Drop zone -->
        <div
          class="border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors"
          :class="dragOver ? 'border-purple-400 bg-purple-500/10' : 'border-gray-700 hover:border-gray-600'"
          @dragover.prevent="dragOver = true"
          @dragleave="dragOver = false"
          @drop.prevent="onDrop"
          @click="fileInput?.click()"
        >
          <UIcon name="i-heroicons-photo" class="w-10 h-10 mx-auto mb-3 text-gray-500" />
          <p class="text-white font-medium">Drop images here or click to browse</p>
          <p class="text-sm text-gray-400 mt-1">PNG, JPG, WEBP supported · Multiple files OK</p>
          <input
            ref="fileInput"
            type="file"
            multiple
            accept="image/*"
            class="hidden"
            @change="handleFiles(($event.target as HTMLInputElement).files)"
          />
        </div>

        <div class="grid grid-cols-2 gap-3">
          <UFormGroup label="Display Mode">
            <USelect
              v-model="form.displayMode"
              :options="[{ value: 'full', label: 'Full Image' }, { value: 'split', label: 'Split' }]"
              option-attribute="label"
              value-attribute="value"
            />
          </UFormGroup>
          <UFormGroup v-if="form.displayMode === 'split'" label="Number of Sections">
            <UInput v-model.number="form.splitCount" type="number" min="2" max="10" />
          </UFormGroup>
        </div>

        <UAlert v-if="form.displayMode === 'split'" color="blue" description="Split mode divides the image into sections, making it easier to navigate large catalog pages." />
      </div>

      <template #footer>
        <div class="flex gap-2 justify-end">
          <UButton variant="ghost" color="gray" @click="emit('update:modelValue', false)">Close</UButton>
          <UButton color="purple" :loading="uploading" icon="i-heroicons-arrow-up-tray" @click="fileInput?.click()">
            Upload
          </UButton>
        </div>
      </template>
    </UCard>
  </UModal>
</template>
