<script setup lang="ts">
import { useAuthStore } from '~/stores/auth'
import { useCurrencyStore } from '~/stores/currency'
import { useLocale } from '~/composables/useLocale'

definePageMeta({ layout: 'default' })

const authStore = useAuthStore()
const currencyStore = useCurrencyStore()
const { t } = useLocale()
const router = useRouter()

useHead({ title: 'Settings' })

const loading = ref(false)
const saving = ref(false)
const refreshing = ref(false)
const message = ref('')
const error = ref('')

const provider = ref<'visa' | 'frankfurter'>('visa')
const displayCurrency = ref('EUR')

const COMMON_CURRENCIES = ['EUR', 'USD', 'GBP', 'JPY', 'CHF', 'AUD', 'CAD', 'CNY', 'KRW', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF'] as const

const providerOptions = computed(() => [
  { value: 'visa', label: t('settings.providerVisa'), hint: t('settings.providerVisaHint') },
  { value: 'frankfurter', label: t('settings.providerFrankfurter'), hint: t('settings.providerFrankfurterHint') },
])

const currencyOptions = computed(() => COMMON_CURRENCIES.map(c => ({ value: c, label: c })))

onMounted(async () => {
  if (!authStore.user) await authStore.fetchMe()
  if (!authStore.isAdmin) {
    router.replace('/')
    return
  }
  await load()
})

async function load() {
  loading.value = true
  error.value = ''
  try {
    const res = await $fetch<{ currencyProvider: 'visa' | 'frankfurter'; displayCurrency: string }>('/api/admin/settings')
    provider.value = res.currencyProvider
    displayCurrency.value = res.displayCurrency
  } catch (e: unknown) {
    error.value = (e as { data?: { message?: string } })?.data?.message ?? 'Failed to load settings'
  } finally {
    loading.value = false
  }
}

async function save() {
  saving.value = true
  error.value = ''
  message.value = ''
  try {
    const res = await $fetch<{ currencyProvider: 'visa' | 'frankfurter'; displayCurrency: string }>('/api/admin/settings', {
      method: 'PUT',
      body: { currencyProvider: provider.value, displayCurrency: displayCurrency.value },
    })
    provider.value = res.currencyProvider
    displayCurrency.value = res.displayCurrency
    // Bring the client store + cached rates in sync with the new config.
    await currencyStore.fetchSettings(true)
    // Clear all cached client-side rates so prices re-fetch under the new provider.
    for (const k of Object.keys(currencyStore.rates)) delete currencyStore.rates[k]
    message.value = t('settings.saved')
  } catch (e: unknown) {
    error.value = (e as { data?: { message?: string } })?.data?.message ?? 'Failed to save settings'
  } finally {
    saving.value = false
  }
}

async function refreshRates() {
  refreshing.value = true
  error.value = ''
  message.value = ''
  try {
    await $fetch('/api/admin/settings/refresh-rates', { method: 'POST' })
    for (const k of Object.keys(currencyStore.rates)) delete currencyStore.rates[k]
    message.value = t('settings.ratesRefreshed')
  } catch (e: unknown) {
    error.value = (e as { data?: { message?: string } })?.data?.message ?? 'Failed to refresh rates'
  } finally {
    refreshing.value = false
  }
}
</script>

<template>
  <div v-if="authStore.isAdmin" class="max-w-2xl mx-auto px-4 py-6 space-y-6">
    <header class="flex items-center justify-between gap-3 flex-wrap">
      <div class="min-w-0 flex-1">
        <h1 class="text-2xl sm:text-3xl font-bold text-white">{{ t('settings.title') }}</h1>
        <p class="text-sm text-gray-400 mt-1">{{ t('settings.subtitle') }}</p>
      </div>
      <UButton variant="ghost" color="gray" icon="i-heroicons-arrow-left" :to="'/'">
        <span class="hidden sm:inline">{{ t('common.back') }}</span>
      </UButton>
    </header>

    <UCard v-if="loading">
      <div class="text-center text-sm text-gray-400 py-6">{{ t('common.loading') }}</div>
    </UCard>

    <template v-else>
      <UCard>
        <template #header>
          <h2 class="font-semibold text-white">{{ t('settings.currencySection') }}</h2>
          <p class="text-xs text-gray-500 mt-1">{{ t('settings.currencySectionHint') }}</p>
        </template>

        <div class="space-y-5">
          <UFormGroup :label="t('settings.displayCurrency')" :hint="t('settings.displayCurrencyHint')">
            <USelect v-model="displayCurrency" :options="currencyOptions" option-attribute="label" value-attribute="value" />
          </UFormGroup>

          <UFormGroup :label="t('settings.provider')">
            <div class="space-y-2">
              <label
                v-for="opt in providerOptions"
                :key="opt.value"
                class="flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors"
                :class="provider === opt.value
                  ? 'border-purple-500 bg-purple-500/10'
                  : 'border-gray-800 bg-gray-900/50 hover:border-gray-700'"
              >
                <input
                  type="radio"
                  :value="opt.value"
                  v-model="provider"
                  class="mt-1 shrink-0 accent-purple-500"
                />
                <div class="min-w-0 flex-1">
                  <div class="text-sm font-medium text-white">{{ opt.label }}</div>
                  <p class="text-xs text-gray-400 mt-0.5">{{ opt.hint }}</p>
                </div>
              </label>
            </div>
          </UFormGroup>

          <p v-if="error" class="text-red-400 text-xs">{{ error }}</p>
          <p v-if="message" class="text-green-400 text-xs">{{ message }}</p>

          <div class="flex flex-wrap gap-2 justify-end pt-2">
            <UButton color="gray" variant="ghost" :loading="refreshing" icon="i-heroicons-arrow-path" @click="refreshRates">
              {{ t('settings.refreshRates') }}
            </UButton>
            <UButton color="purple" :loading="saving" icon="i-heroicons-check" @click="save">
              {{ t('common.save') }}
            </UButton>
          </div>
        </div>
      </UCard>
    </template>
  </div>
</template>
