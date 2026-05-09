<script setup lang="ts">
import { useEventsStore } from '~/stores/events'

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
const submitting = ref(false)

const form = reactive({
  name: '',
  boothNr: '',
  hallNr: '',
  website: '',
  notes: '',
})

watch(() => props.modelValue, (open) => {
  if (open && props.prefillBoothNr) {
    form.boothNr = props.prefillBoothNr
  }
})

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
      mapX: props.initialMapX ?? null,
      mapY: props.initialMapY ?? null,
      mapW: 5,
      mapH: 4,
    })
    emit('update:modelValue', false)
    emit('close')
    Object.assign(form, { name: '', boothNr: '', hallNr: '', website: '', notes: '' })
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
