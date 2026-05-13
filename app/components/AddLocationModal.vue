<script setup lang="ts">
import { useEventsStore } from '~/stores/events'
import { useLocale } from '~/composables/useLocale'

const props = defineProps<{
  modelValue: boolean
  eventId: string
  eventType: 'convention' | 'travel'
}>()
const emit = defineEmits<{ 'update:modelValue': [v: boolean] }>()

const store = useEventsStore()
const { t } = useLocale()
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
    return [
      { value: 'hall', label: t('event.hallType') },
      { value: 'area', label: t('event.areaType') },
    ]
  }
  return [
    { value: 'country', label: t('event.countryType') },
    { value: 'city', label: t('event.cityType') },
    { value: 'district', label: t('event.districtType') },
    { value: 'area', label: t('event.areaType') },
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
          {{ eventType === 'convention' ? t('event.addHall') : t('event.addLocation') }}
        </h3>
      </template>

      <form @submit.prevent="handleSubmit" class="space-y-4">
        <UFormGroup :label="t('common.type')">
          <USelect v-model="form.type" :options="typeOptions" option-attribute="label" value-attribute="value" />
        </UFormGroup>
        <UFormGroup :label="t('common.name')" required>
          <UInput
            v-model="form.name"
            :placeholder="eventType === 'convention' ? t('addLocation.hallPlaceholder') : t('addLocation.travelPlaceholder')"
            autofocus
          />
        </UFormGroup>
        <template v-if="eventType === 'travel'">
          <div class="flex gap-3">
            <UFormGroup :label="t('common.from')" class="flex-1">
              <UInput v-model="form.dateFrom" type="date" />
            </UFormGroup>
            <UFormGroup :label="t('common.to')" class="flex-1">
              <UInput v-model="form.dateTo" type="date" />
            </UFormGroup>
          </div>
        </template>
        <UFormGroup :label="t('common.notes')">
          <UTextarea v-model="form.notes" :rows="2" />
        </UFormGroup>
      </form>

      <template #footer>
        <div class="flex gap-2 justify-end">
          <UButton variant="ghost" color="gray" @click="emit('update:modelValue', false)">{{ t('common.cancel') }}</UButton>
          <UButton color="purple" :loading="submitting" @click="handleSubmit">{{ t('common.add') }}</UButton>
        </div>
      </template>
    </UCard>
  </UModal>
</template>
