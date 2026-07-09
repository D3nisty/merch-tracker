<script setup lang="ts">
import { useEventsStore } from '~/stores/events'
import { usePersonsStore } from '~/stores/persons'
import { useLocale } from '~/composables/useLocale'

const props = defineProps<{
  modelValue: boolean
  locationId: string
  eventType: 'convention' | 'travel'
  initialMapX?: number
  initialMapY?: number
  prefillBoothNr?: string
}>()
const emit = defineEmits<{ 'update:modelValue': [v: boolean]; close: [] }>()

const store = useEventsStore()
const personsStore = usePersonsStore()
const { t } = useLocale()
const submitting = ref(false)

const SHOP_CATEGORIES = ['Figure', 'Artbook', 'Manga', 'CD / Music', 'Camera', 'Electronics', 'Clothes', 'Accessories', 'Stationery', 'Food', 'Restaurant', 'Toy', 'Game']

const form = reactive({
  name: '',
  boothNr: '',
  hallNr: '',
  website: '',
  notes: '',
  categories: [] as string[],
})

watch(() => props.modelValue, (open) => {
  if (open && props.prefillBoothNr) {
    form.boothNr = props.prefillBoothNr
  }
})

function toggleCategory(cat: string) {
  const idx = form.categories.indexOf(cat)
  if (idx === -1) form.categories.push(cat)
  else form.categories.splice(idx, 1)
}

async function handleSubmit() {
  if (!form.name.trim()) return
  submitting.value = true
  try {
    await store.createBooth({
      locationId: props.locationId,
      name: form.name.trim(),
      boothNr: form.boothNr || null,
      hallNr: form.hallNr || null,
      website: form.website || null,
      notes: form.notes || null,
      shopCategory: form.categories.length ? form.categories.join(',') : null,
      personId: personsStore.currentPersonId ?? null,
      mapX: props.initialMapX ?? null,
      mapY: props.initialMapY ?? null,
      mapW: 5,
      mapH: 4,
    })
    emit('update:modelValue', false)
    emit('close')
    Object.assign(form, { name: '', boothNr: '', hallNr: '', website: '', notes: '', categories: [] })
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <UModal :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)">
    <UCard>
      <template #header>
        <h3 class="font-semibold text-white">
          {{ eventType === 'convention' ? t('addBooth.title') : t('addBooth.titleShop') }}
        </h3>
      </template>

      <form @submit.prevent="handleSubmit" class="space-y-4">
        <UFormGroup :label="t('common.name')" required>
          <UInput
            v-model="form.name"
            :placeholder="eventType === 'convention' ? t('addBooth.namePlaceholder') : t('addBooth.namePlaceholderShop')"
            autofocus
          />
        </UFormGroup>

        <div v-if="eventType === 'convention'" class="grid grid-cols-2 gap-3">
          <UFormGroup :label="t('booth.hallNrLabel')">
            <UInput v-model="form.hallNr" :placeholder="t('addBooth.hallNrPlaceholder')" />
          </UFormGroup>
          <UFormGroup :label="t('booth.boothNrLabel')">
            <UInput v-model="form.boothNr" :placeholder="t('addBooth.boothNrPlaceholder')" />
          </UFormGroup>
        </div>

        <UFormGroup v-if="eventType === 'travel'" :label="t('booth.categoriesLabel')">
          <div class="flex flex-wrap gap-2 mt-1">
            <button
              v-for="cat in SHOP_CATEGORIES"
              :key="cat"
              type="button"
              @click="toggleCategory(cat)"
              :class="[
                'px-2.5 py-1 rounded-full text-xs font-medium border transition-all',
                form.categories.includes(cat)
                  ? 'bg-purple-600 border-purple-500 text-white'
                  : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500 hover:text-white',
              ]"
            >
              {{ cat }}
            </button>
          </div>
        </UFormGroup>

        <UFormGroup :label="t('common.website')">
          <UInput v-model="form.website" placeholder="https://..." type="url" />
        </UFormGroup>
        <UFormGroup :label="t('common.notes')">
          <UTextarea v-model="form.notes" :rows="2" />
        </UFormGroup>
      </form>

      <template #footer>
        <div class="flex gap-2 justify-end">
          <UButton variant="ghost" color="gray" @click="emit('update:modelValue', false)">{{ t('common.cancel') }}</UButton>
          <UButton color="primary" :loading="submitting" @click="handleSubmit">{{ t('common.add') }}</UButton>
        </div>
      </template>
    </UCard>
  </UModal>
</template>
