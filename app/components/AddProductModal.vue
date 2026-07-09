<script setup lang="ts">
import { useEventsStore } from '~/stores/events'
import { usePersonsStore } from '~/stores/persons'
import { useLocale } from '~/composables/useLocale'

const props = defineProps<{
  modelValue: boolean
  boothId: string
  prefillName?: string
  prefillCategory?: string
  prefillRegionX?: number
  prefillRegionY?: number
  prefillRegionW?: number
  prefillRegionH?: number
  prefillCatalogImageId?: string
}>()
const emit = defineEmits<{ 'update:modelValue': [v: boolean] }>()

const store = useEventsStore()
const personsStore = usePersonsStore()
const { t } = useLocale()
const submitting = ref(false)

const CURRENCIES = [
  { value: 'EUR', label: '€ EUR' },
  { value: 'JPY', label: '¥ JPY' },
  { value: 'USD', label: '$ USD' },
  { value: 'GBP', label: '£ GBP' },
  { value: 'CHF', label: 'CHF' },
  { value: 'KRW', label: '₩ KRW' },
]

const SIZES = ['A6', 'A5', 'A4', 'A3', 'A2', 'B2', 'B3', '90×50cm', '40×23.5cm', '25cm', '20cm', '15cm', '10cm']
const sizeOptions = computed(() => [{ value: '', label: '— No size —' }, ...SIZES.map(s => ({ value: s, label: s }))])
const CATEGORIES = ['Print', 'Keychain', 'Sticker', 'Acrylic Figure', 'Figure', 'Mousepad', 'Shirt', 'Pin', 'Plush', 'Bag', 'Other']

const form = reactive({
  name: '',
  description: '',
  price: '' as string | number,
  currency: 'EUR',
  quantity: 1,
  size: '',
  category: '',
  priority: 0,
  notes: '',
  personId: null as string | null,
})

watch(() => props.modelValue, (open) => {
  if (open) {
    form.name = props.prefillName ?? ''
    form.category = props.prefillCategory ?? ''
    form.personId = personsStore.currentPersonId
  }
})

const priorityOptions = computed(() => [
  { value: 0, label: t('addProduct.priorityNormal') },
  { value: 1, label: t('addProduct.priorityWant') },
  { value: 2, label: t('addProduct.priorityMust') },
])

const personOptions = computed(() => [
  { value: null, label: t('addProduct.noPerson') },
  ...personsStore.persons.map(p => ({ value: p.id, label: p.name })),
])

async function handleSubmit() {
  if (!form.name.trim()) return
  submitting.value = true
  try {
    await store.createProduct({
      boothId: props.boothId,
      name: form.name.trim(),
      description: form.description || null,
      price: form.price ? Number(form.price) : null,
      currency: form.currency,
      quantity: form.quantity,
      size: form.size || null,
      category: form.category || null,
      priority: form.priority,
      notes: form.notes || null,
      personId: form.personId,
      catalogImageId: props.prefillCatalogImageId ?? null,
      regionX: props.prefillRegionX ?? null,
      regionY: props.prefillRegionY ?? null,
      regionW: props.prefillRegionW ?? null,
      regionH: props.prefillRegionH ?? null,
    })
    emit('update:modelValue', false)
    Object.assign(form, { name: '', description: '', price: '', quantity: 1, size: '', category: '', priority: 0, notes: '' })
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <UModal
    :model-value="modelValue"
    @update:model-value="emit('update:modelValue', $event)"
    :ui="{
      width: 'w-full sm:max-w-lg',
      container: 'flex min-h-full items-end sm:items-center justify-center',
      rounded: 'rounded-t-window sm:rounded-window',
    }"
  >
    <UCard>
      <template #header>
        <!-- mobile grab handle (bottom-sheet affordance) -->
        <div class="sm:hidden w-10 h-1 rounded-full bg-line mx-auto mb-3" />
        <div class="flex items-center justify-between">
          <h3 class="font-bold text-ink-strong text-base">{{ t('booth.addProduct') }}</h3>
          <button type="button" class="text-faint hover:text-ink" @click="emit('update:modelValue', false)">
            <UIcon name="i-heroicons-x-mark" class="w-4.5 h-4.5" />
          </button>
        </div>
      </template>

      <form @submit.prevent="handleSubmit" class="space-y-4">
        <UFormGroup :label="t('common.name')" required>
          <UInput v-model="form.name" :placeholder="t('addProduct.namePlaceholder')" autofocus />
        </UFormGroup>

        <div class="grid grid-cols-3 gap-3">
          <UFormGroup :label="t('booth.price')" class="col-span-1">
            <UInput v-model="form.price" type="number" step="0.01" min="0" placeholder="0.00" />
          </UFormGroup>
          <UFormGroup :label="t('booth.currency')" class="col-span-1">
            <USelect
              v-model="form.currency"
              :options="CURRENCIES"
              option-attribute="label"
              value-attribute="value"
            />
          </UFormGroup>
          <UFormGroup :label="t('addProduct.qty')" class="col-span-1">
            <UInput v-model.number="form.quantity" type="number" min="1" />
          </UFormGroup>
        </div>
        <div v-if="parseFloat(String(form.price)) > 0" class="-mt-2 text-xs text-gray-500 text-right">
          <PriceConverted :amount="parseFloat(String(form.price)) * (form.quantity || 1)" :currency="form.currency" variant="inline" />
        </div>

        <div class="grid grid-cols-2 gap-3">
          <UFormGroup :label="t('booth.size')">
            <USelect
              v-model="form.size"
              :options="sizeOptions"
              option-attribute="label"
              value-attribute="value"
            />
          </UFormGroup>

          <UFormGroup :label="t('addProduct.category')">
            <UInput v-model="form.category" :placeholder="t('addProduct.categoryPlaceholder')" />
            <div class="flex flex-wrap gap-1 mt-1.5">
              <button
                v-for="c in CATEGORIES"
                :key="c"
                type="button"
                class="px-1.5 py-0.5 text-xs rounded border transition-colors"
                :class="form.category === c
                  ? 'bg-chip-sky border-sky text-sky-soft'
                  : 'border-line text-muted hover:border-line-focus'"
                @click="form.category = form.category === c ? '' : c"
              >{{ c }}</button>
            </div>
          </UFormGroup>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <UFormGroup :label="t('addProduct.priority')">
            <div class="flex gap-1.5">
              <button
                v-for="opt in priorityOptions"
                :key="opt.value"
                type="button"
                class="flex-1 text-center py-2 rounded-field border text-[12.5px] font-semibold transition-colors"
                :class="form.priority === opt.value
                  ? (opt.value === 2 ? 'border-must/60 bg-chip-must text-must' : opt.value === 1 ? 'border-planned/60 bg-chip-planned text-planned' : 'border-line-focus bg-surface-2 text-ink')
                  : 'border-line text-muted hover:border-line-focus'"
                @click="form.priority = opt.value"
              >{{ opt.label }}</button>
            </div>
          </UFormGroup>
          <UFormGroup :label="t('nav.person')" v-if="personsStore.persons.length">
            <USelect
              v-model="form.personId"
              :options="personOptions"
              option-attribute="label"
              value-attribute="value"
            />
          </UFormGroup>
        </div>

        <UFormGroup :label="t('addProduct.descriptionNotes')">
          <UInput v-model="form.description" :placeholder="t('addProduct.detailsPlaceholder')" />
        </UFormGroup>
      </form>

      <template #footer>
        <div class="flex gap-2 justify-end">
          <UButton variant="ghost" color="gray" @click="emit('update:modelValue', false)">{{ t('common.cancel') }}</UButton>
          <UButton color="primary" :loading="submitting" @click="handleSubmit">{{ t('booth.addProduct') }}</UButton>
        </div>
      </template>
    </UCard>
  </UModal>
</template>
