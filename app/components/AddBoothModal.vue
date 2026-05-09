<script setup lang="ts">
import { useEventsStore } from '~/stores/events'
import { usePersonsStore } from '~/stores/persons'

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
const submitting = ref(false)

const SHOP_CATEGORIES = ['Figure', 'Artbook', 'Manga', 'CD / Music', 'Camera', 'Electronics', 'Clothes', 'Accessories', 'Stationery', 'Food', 'Toy', 'Game']

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
          Add {{ eventType === 'convention' ? 'Booth' : 'Shop / Stop' }}
        </h3>
      </template>

      <form @submit.prevent="handleSubmit" class="space-y-4">
        <UFormGroup label="Name" required>
          <UInput
            v-model="form.name"
            :placeholder="eventType === 'convention' ? 'e.g. Phinea Miaow' : 'e.g. Animate Akihabara'"
            autofocus
          />
        </UFormGroup>

        <div v-if="eventType === 'convention'" class="grid grid-cols-2 gap-3">
          <UFormGroup label="Hall Nr">
            <UInput v-model="form.hallNr" placeholder="e.g. 10" />
          </UFormGroup>
          <UFormGroup label="Booth Nr">
            <UInput v-model="form.boothNr" placeholder="e.g. L13" />
          </UFormGroup>
        </div>

        <UFormGroup v-if="eventType === 'travel'" label="Categories">
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

        <UFormGroup label="Website">
          <UInput v-model="form.website" placeholder="https://..." type="url" />
        </UFormGroup>
        <UFormGroup label="Notes">
          <UTextarea v-model="form.notes" rows="2" />
        </UFormGroup>
      </form>

      <template #footer>
        <div class="flex gap-2 justify-end">
          <UButton variant="ghost" color="gray" @click="emit('update:modelValue', false)">Cancel</UButton>
          <UButton color="purple" :loading="submitting" @click="handleSubmit">Add</UButton>
        </div>
      </template>
    </UCard>
  </UModal>
</template>
