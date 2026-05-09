<script setup lang="ts">
import { useEventsStore } from '~/stores/events'
import type { Event } from '~/stores/events'

const props = defineProps<{
  modelValue: boolean
  event: Event
}>()
const emit = defineEmits<{ 'update:modelValue': [v: boolean] }>()

const store = useEventsStore()
const submitting = ref(false)

const form = reactive({
  name: props.event.name,
  date: props.event.date ?? '',
  location: props.event.location ?? '',
  description: props.event.description ?? '',
})

watch(() => props.event, (e) => {
  form.name = e.name
  form.date = e.date ?? ''
  form.location = e.location ?? ''
  form.description = e.description ?? ''
})

async function handleSubmit() {
  if (!form.name.trim()) return
  submitting.value = true
  try {
    await store.updateEvent(props.event.id, {
      name: form.name.trim(),
      date: form.date || null,
      location: form.location || null,
      description: form.description || null,
    })
    emit('update:modelValue', false)
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <UModal :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)">
    <UCard>
      <template #header>
        <h3 class="font-semibold text-white">Edit Event</h3>
      </template>

      <form @submit.prevent="handleSubmit" class="space-y-4">
        <UFormGroup label="Name" required>
          <UInput v-model="form.name" autofocus />
        </UFormGroup>
        <UFormGroup :label="event.type === 'convention' ? 'Venue / City' : 'Country / Region'">
          <UInput v-model="form.location" />
        </UFormGroup>
        <UFormGroup label="Date">
          <UInput v-model="form.date" type="date" />
        </UFormGroup>
        <UFormGroup label="Description">
          <UTextarea v-model="form.description" rows="3" />
        </UFormGroup>
      </form>

      <template #footer>
        <div class="flex gap-2 justify-end">
          <UButton variant="ghost" color="gray" @click="emit('update:modelValue', false)">Cancel</UButton>
          <UButton color="purple" :loading="submitting" @click="handleSubmit">Save</UButton>
        </div>
      </template>
    </UCard>
  </UModal>
</template>
