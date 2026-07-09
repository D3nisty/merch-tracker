<script setup lang="ts">
import { useEventsStore } from '~/stores/events'
import { useLocale } from '~/composables/useLocale'

const store = useEventsStore()
const router = useRouter()
const { t } = useLocale()

useHead({ title: 'New event' })

const form = reactive({
  name: '',
  type: 'convention' as 'convention' | 'travel',
  date: '',
  dateTo: '',
  location: '',
  description: '',
})

const dateToMin = computed(() => form.date || undefined)

const submitting = ref(false)
const error = ref('')

async function handleSubmit() {
  if (!form.name.trim()) {
    error.value = t('createEvent.nameRequired')
    return
  }
  submitting.value = true
  error.value = ''
  try {
    const normalisedDateTo = form.dateTo && form.date && form.dateTo > form.date ? form.dateTo : null
    const created = await store.createEvent({
      name: form.name.trim(),
      type: form.type,
      date: form.date || null,
      dateTo: normalisedDateTo,
      location: form.location || null,
      description: form.description || null,
    })
    router.push(`/events/${created.slug ?? created.id}`)
  } catch (e: unknown) {
    error.value = (e as Error).message || t('createEvent.failedCreate')
  } finally {
    submitting.value = false
  }
}

const typeOptions = computed(() => [
  { value: 'convention', label: t('createEvent.conventionLabel'), icon: 'i-heroicons-ticket', description: t('createEvent.conventionDesc') },
  { value: 'travel', label: t('createEvent.travelLabel'), icon: 'i-heroicons-map', description: t('createEvent.travelDesc') },
])
</script>

<template>
  <div class="max-w-lg mx-auto">
    <div class="mb-6">
      <NuxtLink to="/" class="text-gray-400 hover:text-white flex items-center gap-1 text-sm mb-4">
        <UIcon name="i-heroicons-arrow-left" class="w-4 h-4" /> {{ t('common.back') }}
      </NuxtLink>
      <h1 class="text-2xl font-bold text-white">{{ t('createEvent.title') }}</h1>
    </div>

    <UCard>
      <form @submit.prevent="handleSubmit" class="space-y-5">
        <!-- Type selection -->
        <div>
          <label class="block text-sm font-medium text-gray-300 mb-2">{{ t('createEvent.eventType') }}</label>
          <div class="grid grid-cols-2 gap-3">
            <button
              v-for="opt in typeOptions"
              :key="opt.value"
              type="button"
              @click="form.type = opt.value as typeof form.type"
              :class="[
                'p-4 rounded-lg border-2 text-left transition-all',
                form.type === opt.value
                  ? 'border-sky bg-chip-sky'
                  : 'border-gray-700 hover:border-gray-600',
              ]"
            >
              <UIcon :name="opt.icon" class="w-5 h-5 mb-2" :class="form.type === opt.value ? 'text-sky' : 'text-gray-400'" />
              <div class="font-medium text-white text-sm">{{ opt.label }}</div>
              <div class="text-xs text-gray-400 mt-1">{{ opt.description }}</div>
            </button>
          </div>
        </div>

        <UFormGroup :label="t('createEvent.eventName')" required>
          <UInput v-model="form.name" :placeholder="t('createEvent.namePlaceholder')" autofocus />
        </UFormGroup>

        <UFormGroup :label="form.type === 'convention' ? t('createEvent.venueCity') : t('createEvent.countryRegion')">
          <UInput v-model="form.location" :placeholder="form.type === 'convention' ? t('createEvent.venuePlaceholder') : t('createEvent.countryPlaceholder')" />
        </UFormGroup>

        <div class="grid grid-cols-2 gap-3">
          <UFormGroup :label="t('common.from')">
            <UInput v-model="form.date" type="date" />
          </UFormGroup>
          <UFormGroup :label="t('common.to')">
            <UInput v-model="form.dateTo" type="date" :min="dateToMin" :disabled="!form.date" />
          </UFormGroup>
        </div>

        <UFormGroup :label="t('common.description')">
          <UTextarea v-model="form.description" :placeholder="t('createEvent.descriptionPlaceholder')" :rows="3" />
        </UFormGroup>

        <UAlert v-if="error" color="red" :description="error" />

        <div class="flex gap-3 justify-end">
          <UButton variant="ghost" color="gray" to="/">{{ t('common.cancel') }}</UButton>
          <UButton type="submit" color="primary" :loading="submitting">{{ t('createEvent.title') }}</UButton>
        </div>
      </form>
    </UCard>
  </div>
</template>
