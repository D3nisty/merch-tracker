<script setup lang="ts">
import { useEventsStore } from '~/stores/events'

const props = defineProps<{
  modelValue: boolean
  eventId: string
  eventType: 'convention' | 'travel'
}>()
const emit = defineEmits<{ 'update:modelValue': [v: boolean] }>()

const store = useEventsStore()
const submitting = ref(false)

const form = reactive({
  name: '',
  type: props.eventType === 'convention' ? 'hall' : 'city',
  notes: '',
  dateFrom: '',
  dateTo: '',
})

const typeOptions = computed(() => {
  if (props.eventType === 'convention') {
    return [{ value: 'hall', label: 'Hall' }, { value: 'area', label: 'Area' }]
  }
  return [
    { value: 'country', label: 'Country' },
    { value: 'city', label: 'City' },
    { value: 'district', label: 'District' },
    { value: 'area', label: 'Area' },
  ]
})

async function handleSubmit() {
  if (!form.name.trim()) return
  submitting.value = true
  try {
    await store.createLocation({
      eventId: props.eventId,
      name: form.name.trim(),
      type: form.type as 'hall' | 'city' | 'country' | 'area' | 'district',
      notes: form.notes || null,
      dateFrom: form.dateFrom || null,
      dateTo: form.dateTo || null,
    })
    emit('update:modelValue', false)
    form.name = ''
    form.notes = ''
    form.dateFrom = ''
    form.dateTo = ''
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
          Add {{ eventType === 'convention' ? 'Hall' : 'Location' }}
        </h3>
      </template>

      <form @submit.prevent="handleSubmit" class="space-y-4">
        <UFormGroup label="Type">
          <USelect v-model="form.type" :options="typeOptions" option-attribute="label" value-attribute="value" />
        </UFormGroup>
        <UFormGroup label="Name" required>
          <UInput v-model="form.name" :placeholder="eventType === 'convention' ? 'e.g. Halle 10' : 'e.g. Tokyo'" autofocus />
        </UFormGroup>
        <template v-if="eventType === 'travel'">
          <div class="flex gap-3">
            <UFormGroup label="From" class="flex-1">
              <UInput v-model="form.dateFrom" type="date" />
            </UFormGroup>
            <UFormGroup label="To" class="flex-1">
              <UInput v-model="form.dateTo" type="date" />
            </UFormGroup>
          </div>
        </template>
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
