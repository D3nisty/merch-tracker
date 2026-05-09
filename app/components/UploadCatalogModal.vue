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
  customName: '',
  imageType: 'catalog' as 'catalog' | 'article' | 'receipt',
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
      fd.append('imageType', form.imageType)
      fd.append('displayMode', form.displayMode)
      fd.append('splitCount', String(form.splitCount))
      if (form.customName.trim()) fd.append('customName', form.customName.trim())

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

function onDrop(e: DragEvent) {
  dragOver.value = false
  handleFiles(e.dataTransfer?.files ?? null)
}

const typeColor = computed(() => {
  if (form.imageType === 'article') return 'orange'
  if (form.imageType === 'receipt') return 'green'
  return 'purple'
})
</script>

<template>
  <UModal :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)" :ui="{ width: 'sm:max-w-lg' }">
    <UCard>
      <template #header>
        <h3 class="font-semibold text-white">Upload Image</h3>
      </template>

      <div class="space-y-4">
        <!-- Image type selection -->
        <UFormGroup label="What is this image?">
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
              <div class="font-medium text-xs" :class="form.imageType === 'catalog' ? 'text-white' : 'text-gray-300'">Catalog</div>
              <div class="text-xs text-gray-500 mt-0.5">Multiple items</div>
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
              <div class="font-medium text-xs" :class="form.imageType === 'article' ? 'text-white' : 'text-gray-300'">Article</div>
              <div class="text-xs text-gray-500 mt-0.5">Single item</div>
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
              <div class="font-medium text-xs" :class="form.imageType === 'receipt' ? 'text-white' : 'text-gray-300'">Receipt</div>
              <div class="text-xs text-gray-500 mt-0.5">Mark as paid</div>
            </button>
          </div>
        </UFormGroup>

        <!-- Name -->
        <UFormGroup :label="form.imageType === 'article' ? 'Article Name' : form.imageType === 'receipt' ? 'Receipt Label (optional)' : 'Label (optional)'">
          <UInput
            v-model="form.customName"
            :placeholder="form.imageType === 'article' ? 'e.g. Miku Bunny Figure' : form.imageType === 'receipt' ? 'e.g. Day 1 purchases' : 'e.g. Phinea Miaow 2026 Catalog'"
          />
        </UFormGroup>

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
          <p class="text-white font-medium">Drop image here or click to browse</p>
          <p class="text-sm text-gray-400 mt-1">PNG, JPG, WEBP · Multiple files OK</p>
          <input
            ref="fileInput"
            type="file"
            multiple
            accept="image/*"
            class="hidden"
            @change="handleFiles(($event.target as HTMLInputElement).files)"
          />
        </div>

        <div v-if="form.imageType === 'catalog'" class="grid grid-cols-2 gap-3">
          <UFormGroup label="Display Mode">
            <USelect
              v-model="form.displayMode"
              :options="[{ value: 'full', label: 'Full Image' }, { value: 'split', label: 'Split Sections' }]"
              option-attribute="label" value-attribute="value"
            />
          </UFormGroup>
          <UFormGroup v-if="form.displayMode === 'split'" label="Sections">
            <UInput v-model.number="form.splitCount" type="number" min="2" max="10" />
          </UFormGroup>
        </div>
      </div>

      <template #footer>
        <div class="flex gap-2 justify-end">
          <UButton variant="ghost" color="gray" @click="emit('update:modelValue', false)">Close</UButton>
          <UButton
            :color="typeColor"
            :loading="uploading"
            icon="i-heroicons-arrow-up-tray"
            @click="fileInput?.click()"
          >Upload</UButton>
        </div>
      </template>
    </UCard>
  </UModal>
</template>
