<script setup lang="ts">
import { useEventsStore } from '~/stores/events'
import type { Event } from '~/stores/events'
import { useLocale } from '~/composables/useLocale'

const props = defineProps<{
  modelValue: boolean
  event: Event
}>()
const emit = defineEmits<{ 'update:modelValue': [v: boolean] }>()

const store = useEventsStore()
const { t } = useLocale()
const submitting = ref(false)

const form = reactive({
  name: props.event.name,
  date: props.event.date ?? '',
  dateTo: props.event.dateTo ?? '',
  location: props.event.location ?? '',
  description: props.event.description ?? '',
  isPublic: props.event.isPublic ?? false,
})

watch(() => props.event, (e) => {
  form.name = e.name
  form.date = e.date ?? ''
  form.dateTo = e.dateTo ?? ''
  form.location = e.location ?? ''
  form.description = e.description ?? ''
  form.isPublic = e.isPublic ?? false
})

// The "to" date input clamps to >= the start so the browser picker hints at
// valid values. We also drop dateTo on submit when it's on/before the start
// (server does the same — defense in depth).
const dateToMin = computed(() => form.date || undefined)

async function handleSubmit() {
  if (!form.name.trim()) return
  submitting.value = true
  try {
    const normalisedDateTo = form.dateTo && form.date && form.dateTo > form.date ? form.dateTo : null
    await store.updateEvent(props.event.id, {
      name: form.name.trim(),
      date: form.date || null,
      dateTo: normalisedDateTo,
      location: form.location || null,
      description: form.description || null,
      isPublic: form.isPublic,
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
        <h3 class="font-semibold text-white">{{ t('event.editTitle') }}</h3>
      </template>

      <form @submit.prevent="handleSubmit" class="space-y-4">
        <UFormGroup :label="t('common.name')" required>
          <UInput v-model="form.name" autofocus />
        </UFormGroup>
        <UFormGroup :label="event.type === 'convention' ? t('createEvent.venueCity') : t('createEvent.countryRegion')">
          <UInput v-model="form.location" />
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
          <UTextarea v-model="form.description" :rows="3" />
        </UFormGroup>

        <!-- Public/Private toggle -->
        <div class="flex items-start gap-3 p-3 rounded-lg border"
          :class="form.isPublic ? 'border-green-500/40 bg-green-500/5' : 'border-gray-700 bg-gray-900'">
          <UToggle v-model="form.isPublic" color="green" class="mt-0.5" />
          <div class="flex-1 min-w-0">
            <div class="text-sm font-medium text-white flex items-center gap-2">
              <UIcon :name="form.isPublic ? 'i-heroicons-globe-alt' : 'i-heroicons-lock-closed'" class="w-4 h-4" />
              {{ form.isPublic ? t('sharing.publicEvent') : t('sharing.private') }}
            </div>
            <p class="text-xs text-gray-400 mt-0.5">{{ t('sharing.publicDesc') }}</p>
          </div>
        </div>
      </form>

      <template #footer>
        <div class="flex gap-2 justify-end">
          <UButton variant="ghost" color="gray" @click="emit('update:modelValue', false)">{{ t('common.cancel') }}</UButton>
          <UButton color="primary" :loading="submitting" @click="handleSubmit">{{ t('common.save') }}</UButton>
        </div>
      </template>
    </UCard>
  </UModal>
</template>
