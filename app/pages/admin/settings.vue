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
const defaultPublic = ref(false)
const allowGuest = ref(true)

// Live rates list (common source currencies → the display currency).
const RATE_SOURCES = ['JPY', 'KRW', 'USD', 'GBP', 'TWD', 'CHF']
const rateRows = computed(() =>
  RATE_SOURCES
    .filter(c => c !== displayCurrency.value)
    .map(c => ({ from: c, to: displayCurrency.value, rate: currencyStore.convert(1, c)?.value ?? null })),
)
async function toggleDefault(which: 'defaultPublic' | 'allowGuest') {
  if (which === 'defaultPublic') defaultPublic.value = !defaultPublic.value
  else allowGuest.value = !allowGuest.value
  await save()
}

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
    const res = await $fetch<{ currencyProvider: 'visa' | 'frankfurter'; displayCurrency: string; defaultPublic: boolean; allowGuest: boolean }>('/api/admin/settings')
    provider.value = res.currencyProvider
    displayCurrency.value = res.displayCurrency
    defaultPublic.value = res.defaultPublic
    allowGuest.value = res.allowGuest
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
    const res = await $fetch<{ currencyProvider: 'visa' | 'frankfurter'; displayCurrency: string; defaultPublic: boolean; allowGuest: boolean }>('/api/admin/settings', {
      method: 'PUT',
      body: { currencyProvider: provider.value, displayCurrency: displayCurrency.value, defaultPublic: defaultPublic.value, allowGuest: allowGuest.value },
    })
    provider.value = res.currencyProvider
    displayCurrency.value = res.displayCurrency
    defaultPublic.value = res.defaultPublic
    allowGuest.value = res.allowGuest
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

          <!-- Live rates list -->
          <div>
            <div class="text-[11px] font-bold uppercase tracking-[0.08em] text-faint mb-2">{{ t('settings.currencyRates') }}</div>
            <div class="rounded-card border border-line overflow-hidden">
              <div v-for="(r, i) in rateRows" :key="r.from" class="flex items-center justify-between px-3.5 py-2.5 text-sm" :class="i < rateRows.length - 1 ? 'border-b border-line-soft' : ''">
                <span class="text-ink">{{ r.from }} → {{ r.to }}</span>
                <span class="mono text-muted">{{ r.rate != null ? r.rate.toFixed(5) : '…' }}</span>
              </div>
              <div v-if="!rateRows.length" class="px-3.5 py-3 text-xs text-faint text-center">{{ displayCurrency }}</div>
            </div>
            <div class="flex items-center gap-2 mt-2 px-3 py-2 rounded-field bg-chip-bought/60 border border-bought/30 text-xs text-bought">
              <UIcon name="i-heroicons-arrow-path" class="w-3.5 h-3.5" /> {{ t('settings.ratesAutoNote') }}
            </div>
          </div>

          <p v-if="error" class="text-must text-xs">{{ error }}</p>
          <p v-if="message" class="text-bought text-xs">{{ message }}</p>

          <div class="flex flex-wrap gap-2 justify-end pt-2">
            <UButton color="gray" variant="ghost" :loading="refreshing" icon="i-heroicons-arrow-path" @click="refreshRates">
              {{ t('settings.refreshRates') }}
            </UButton>
            <UButton color="primary" :loading="saving" icon="i-heroicons-check" @click="save">
              {{ t('common.save') }}
            </UButton>
          </div>
        </div>
      </UCard>

      <!-- Defaults -->
      <UCard>
        <template #header>
          <h2 class="font-semibold text-ink-strong">{{ t('settings.defaultsSection') }}</h2>
        </template>
        <div class="space-y-2">
          <div class="flex items-center justify-between px-3.5 py-3 rounded-card bg-surface-2 border border-line">
            <span class="text-sm text-ink">{{ t('settings.defaultPublic') }}</span>
            <button
              type="button"
              class="w-[42px] h-6 rounded-full relative transition-colors shrink-0"
              :class="defaultPublic ? 'bg-bought' : 'bg-line-soft'"
              :disabled="saving"
              @click="toggleDefault('defaultPublic')"
            >
              <span class="absolute top-[3px] w-[18px] h-[18px] rounded-full transition-all" :class="defaultPublic ? 'right-[3px] bg-on-accent' : 'left-[3px] bg-faint'" />
            </button>
          </div>
          <div class="flex items-center justify-between px-3.5 py-3 rounded-card bg-surface-2 border border-line">
            <span class="text-sm text-ink">{{ t('settings.allowGuest') }}</span>
            <button
              type="button"
              class="w-[42px] h-6 rounded-full relative transition-colors shrink-0"
              :class="allowGuest ? 'bg-bought' : 'bg-line-soft'"
              :disabled="saving"
              @click="toggleDefault('allowGuest')"
            >
              <span class="absolute top-[3px] w-[18px] h-[18px] rounded-full transition-all" :class="allowGuest ? 'right-[3px] bg-on-accent' : 'left-[3px] bg-faint'" />
            </button>
          </div>
        </div>
      </UCard>
    </template>
  </div>
</template>
