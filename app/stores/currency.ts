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

const CLIENT_TTL_MS = 6 * 60 * 60 * 1000 // 6h, only relevant for 'latest' entries.

// Normalise the optional date arg to either 'latest' or 'YYYY-MM-DD'. Dates
// in the future fall back to 'latest' so a slightly-clock-ahead client never
// asks for a date the server can't resolve.
function normalizeDate(date: string | null | undefined): string {
  if (!date) return 'latest'
  const iso = date.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return 'latest'
  const today = new Date().toISOString().slice(0, 10)
  return iso >= today ? 'latest' : iso
}

export const useCurrencyStore = defineStore('currency', () => {
  // Public settings — populated on first load via fetchSettings(). Render
  // logic should treat `loaded === false` as "no conversion yet".
  const displayCurrency = ref<string>('EUR')
  const provider = ref<Provider>('visa')
  const loaded = ref(false)

  // Cache keyed by `${from}->${to}@${date}` (uppercase pair, ISO date or
  // 'latest'). Reactive map so templates referring to `convert(...)`
  // re-render once a rate arrives.
  const rates = reactive<Record<string, RateState>>({})

  async function fetchSettings(force = false) {
    if (loaded.value && !force) return
    try {
      const res = await $fetch<{ displayCurrency: string; currencyProvider: Provider }>('/api/settings/public')
      displayCurrency.value = (res.displayCurrency || 'EUR').toUpperCase()
      provider.value = res.currencyProvider === 'frankfurter' ? 'frankfurter' : 'visa'
      loaded.value = true
    } catch {
      loaded.value = true
    }
  }

  function key(from: string, to: string, date: string): string {
    return `${from.toUpperCase()}->${to.toUpperCase()}@${date}`
  }

  async function ensureRate(from: string, to: string, date?: string | null): Promise<void> {
    const fromU = from.toUpperCase()
    const toU = to.toUpperCase()
    if (fromU === toU) return // identity, no fetch needed
    const dateKey = normalizeDate(date)
    const k = key(fromU, toU, dateKey)
    const current = rates[k]
    if (current?.status === 'loading') return
    // Historical entries never need to refresh — past rates don't change.
    if (current?.status === 'ready' && current.entry) {
      if (dateKey !== 'latest') return
      if (Date.now() - current.entry.fetchedAt < CLIENT_TTL_MS) return
    }

    rates[k] = { status: 'loading' }
    try {
      const query: Record<string, string> = { from: fromU, to: toU }
      if (dateKey !== 'latest') query.date = dateKey
      const res = await $fetch<{ rate: number; fetchedAt: number; provider: Provider; fellBack: boolean }>('/api/currency/rate', { query })
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
   * Pass `date` to use a historical rate (ISO `YYYY-MM-DD` or any longer
   * ISO prefix — only the date portion is used). Returns null when the rate
   * isn't loaded yet or when conversion is unnecessary (same currency).
   */
  function convert(amount: number | null | undefined, from: string, date?: string | null): {
    value: number
    rate: number
    target: string
    provider: Provider
    fellBack: boolean
    fetchedAt: number
    date: string
  } | null {
    if (amount == null || !Number.isFinite(amount)) return null
    const fromU = from.toUpperCase()
    const toU = displayCurrency.value.toUpperCase()
    if (fromU === toU) return null // no-op: same currency
    const dateKey = normalizeDate(date)
    const entry = rates[key(fromU, toU, dateKey)]
    if (!entry || entry.status !== 'ready' || !entry.entry) {
      // Lazy-load: trigger and return null for now.
      void ensureRate(fromU, toU, dateKey === 'latest' ? null : dateKey)
      return null
    }
    return {
      value: amount * entry.entry.rate,
      rate: entry.entry.rate,
      target: toU,
      provider: entry.entry.provider,
      fellBack: entry.entry.fellBack,
      fetchedAt: entry.entry.fetchedAt,
      date: dateKey,
    }
  }

  /**
   * Sum a `{ [currency]: amount }` map into the display currency, optionally
   * using a historical rate per the same `date`. Returns null until every
   * constituent rate is loaded; partial readiness is reported via
   * `missing[]` so the consumer can decide between "show what we have" and
   * "wait for everything".
   */
  function convertTotals(by: Record<string, number>, date?: string | null): {
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
      const conv = convert(amount, cur, date)
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
