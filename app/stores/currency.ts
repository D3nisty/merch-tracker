import { defineStore } from 'pinia'

export type Provider = 'visa' | 'frankfurter'

interface RateEntry {
  rate: number
  fetchedAt: number
  provider: Provider
  fellBack: boolean
}

interface RateState {
  status: 'loading' | 'ready' | 'error'
  entry?: RateEntry
  error?: string
}

const CLIENT_TTL_MS = 6 * 60 * 60 * 1000 // 6h. Server caches 12h; this is the additional client-side coalescing window.

export const useCurrencyStore = defineStore('currency', () => {
  // Public settings — populated on first load via fetchSettings(). Render
  // logic should treat `loaded === false` as "no conversion yet".
  const displayCurrency = ref<string>('EUR')
  const provider = ref<Provider>('visa')
  const loaded = ref(false)

  // Cache keyed by `${from}->${to}` (uppercase). Reactive map so templates
  // referring to `convert(...)` re-render once a rate arrives.
  const rates = reactive<Record<string, RateState>>({})

  async function fetchSettings(force = false) {
    if (loaded.value && !force) return
    try {
      const res = await $fetch<{ displayCurrency: string; currencyProvider: Provider }>('/api/settings/public')
      displayCurrency.value = (res.displayCurrency || 'EUR').toUpperCase()
      provider.value = res.currencyProvider === 'frankfurter' ? 'frankfurter' : 'visa'
      loaded.value = true
    } catch {
      // Soft-fail: keep defaults so the rest of the UI still renders. The
      // convert() function will return null for everything which the views
      // already handle (no caption shown).
      loaded.value = true
    }
  }

  function key(from: string, to: string): string {
    return `${from.toUpperCase()}->${to.toUpperCase()}`
  }

  async function ensureRate(from: string, to: string): Promise<void> {
    const fromU = from.toUpperCase()
    const toU = to.toUpperCase()
    if (fromU === toU) return // identity, no fetch needed
    const k = key(fromU, toU)
    const current = rates[k]
    if (current?.status === 'loading') return
    if (current?.status === 'ready' && current.entry && Date.now() - current.entry.fetchedAt < CLIENT_TTL_MS) return

    rates[k] = { status: 'loading' }
    try {
      const res = await $fetch<{ rate: number; fetchedAt: number; provider: Provider; fellBack: boolean }>('/api/currency/rate', {
        query: { from: fromU, to: toU },
      })
      rates[k] = {
        status: 'ready',
        entry: { rate: res.rate, fetchedAt: res.fetchedAt, provider: res.provider, fellBack: res.fellBack },
      }
    } catch (e: unknown) {
      rates[k] = { status: 'error', error: (e as { message?: string })?.message ?? 'fetch failed' }
    }
  }

  /**
   * Convert `amount` from `from` to the configured display currency.
   * Returns null when the rate isn't loaded yet or when conversion is
   * unnecessary (already in target currency). Synchronous read; the actual
   * fetch is triggered lazily — the first call for a new pair returns null
   * and schedules a fetch, the value populates on the next render tick.
   */
  function convert(amount: number | null | undefined, from: string): {
    value: number
    rate: number
    target: string
    provider: Provider
    fellBack: boolean
    fetchedAt: number
  } | null {
    if (amount == null || !Number.isFinite(amount)) return null
    const fromU = from.toUpperCase()
    const toU = displayCurrency.value.toUpperCase()
    if (fromU === toU) return null // no-op: same currency
    const entry = rates[key(fromU, toU)]
    if (!entry || entry.status !== 'ready' || !entry.entry) {
      // Lazy-load: trigger and return null for now.
      void ensureRate(fromU, toU)
      return null
    }
    return {
      value: amount * entry.entry.rate,
      rate: entry.entry.rate,
      target: toU,
      provider: entry.entry.provider,
      fellBack: entry.entry.fellBack,
      fetchedAt: entry.entry.fetchedAt,
    }
  }

  /**
   * Sum a `{ [currency]: amount }` map into the display currency. Returns
   * null until every constituent rate is loaded — avoids flashing partial
   * sums while rates trickle in.
   */
  function convertTotals(by: Record<string, number>): {
    value: number
    target: string
    partial: boolean
    missing: string[]
  } | null {
    const target = displayCurrency.value.toUpperCase()
    let total = 0
    const missing: string[] = []
    for (const [cur, amount] of Object.entries(by)) {
      if (!amount) continue
      if (cur.toUpperCase() === target) {
        total += amount
        continue
      }
      const conv = convert(amount, cur)
      if (!conv) {
        missing.push(cur)
        continue
      }
      total += conv.value
    }
    if (!Object.keys(by).length) return null
    return { value: total, target, partial: missing.length > 0, missing }
  }

  return {
    displayCurrency,
    provider,
    loaded,
    rates,
    fetchSettings,
    ensureRate,
    convert,
    convertTotals,
  }
})
