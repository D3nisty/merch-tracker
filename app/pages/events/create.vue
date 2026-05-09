<script setup lang="ts">
import { useEventsStore } from '~/stores/events'

const store = useEventsStore()
const router = useRouter()

const form = reactive({
  name: '',
  type: 'convention' as 'convention' | 'travel',
  date: '',
  location: '',
  description: '',
})

const submitting = ref(false)
const error = ref('')

async function handleSubmit() {
  if (!form.name.trim()) {
    error.value = 'Name is required'
    return
  }
  submitting.value = true
  error.value = ''
  try {
    const created = await store.createEvent({
      name: form.name.trim(),
      type: form.type,
      date: form.date || null,
      location: form.location || null,
      description: form.description || null,
    })
    router.push(`/events/${created.id}`)
  } catch (e: unknown) {
    error.value = (e as Error).message || 'Failed to create event'
  } finally {
    submitting.value = false
  }
}

const typeOptions = [
  { value: 'convention', label: 'Convention', icon: 'i-heroicons-ticket', description: 'Anime/gaming convention with halls and booths' },
  { value: 'travel', label: 'Travel', icon: 'i-heroicons-map', description: 'Country or city shopping trip' },
]
</script>

<template>
  <div class="max-w-lg mx-auto">
    <div class="mb-6">
      <NuxtLink to="/" class="text-gray-400 hover:text-white flex items-center gap-1 text-sm mb-4">
        <UIcon name="i-heroicons-arrow-left" class="w-4 h-4" /> Back
      </NuxtLink>
      <h1 class="text-2xl font-bold text-white">New Event</h1>
    </div>

    <UCard>
      <form @submit.prevent="handleSubmit" class="space-y-5">
        <!-- Type selection -->
        <div>
          <label class="block text-sm font-medium text-gray-300 mb-2">Event Type</label>
          <div class="grid grid-cols-2 gap-3">
            <button
              v-for="opt in typeOptions"
              :key="opt.value"
              type="button"
              @click="form.type = opt.value as typeof form.type"
              :class="[
                'p-4 rounded-lg border-2 text-left transition-all',
                form.type === opt.value
                  ? 'border-purple-500 bg-purple-500/10'
                  : 'border-gray-700 hover:border-gray-600',
              ]"
            >
              <UIcon :name="opt.icon" class="w-5 h-5 mb-2" :class="form.type === opt.value ? 'text-purple-400' : 'text-gray-400'" />
              <div class="font-medium text-white text-sm">{{ opt.label }}</div>
              <div class="text-xs text-gray-400 mt-1">{{ opt.description }}</div>
            </button>
          </div>
        </div>

        <UFormGroup label="Event Name" required>
          <UInput v-model="form.name" placeholder="e.g. Dokomi 2026" autofocus />
        </UFormGroup>

        <UFormGroup :label="form.type === 'convention' ? 'Venue / City' : 'Country / Region'">
          <UInput v-model="form.location" :placeholder="form.type === 'convention' ? 'e.g. Düsseldorf' : 'e.g. Japan'" />
        </UFormGroup>

        <UFormGroup label="Date">
          <UInput v-model="form.date" type="date" />
        </UFormGroup>

        <UFormGroup label="Description">
          <UTextarea v-model="form.description" placeholder="Optional notes..." rows="3" />
        </UFormGroup>

        <UAlert v-if="error" color="red" :description="error" />

        <div class="flex gap-3 justify-end">
          <UButton variant="ghost" color="gray" to="/">Cancel</UButton>
          <UButton type="submit" color="purple" :loading="submitting">Create Event</UButton>
        </div>
      </form>
    </UCard>
  </div>
</template>
