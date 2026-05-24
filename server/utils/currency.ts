import { useDb } from '../db'
import { appSettings } from '../db/schema'
import { eq } from 'drizzle-orm'
import { now } from './id'

/**
 * Currency conversion utility. Reads the admin-configured provider from
 * `app_settings`, fetches rates from either Visa's public widget endpoint or
 * Frankfurter (ECB), and caches the result in-process for 12 hours so we
 * don't hammer external APIs.
 *
 * Visa's endpoint is undocumented and could change. When Visa is configured
 * but a call fails (network error or unparseable response), `getRate` falls
 * back to Frankfurter transparently so the app keeps working.
 */

export type Provider = 'visa' | 'frankfurter'

const RATE_TTL_MS = 12 * 60 * 60 * 1000 // 12h

interface CachedRate {
  rate: number
  fetchedAt: number // epoch ms
  provider: Provider
}

const rateCache = new Map<string, CachedRate>()

function cacheKey(from: string, to: string, provider: Provider): string {
  return `${provider}:${from.toUpperCase()}->${to.toUpperCase()}`
}

export function clearRateCache(): void {
  rateCache.clear()
}

// ── Settings helpers ─────────────────────────────────────────────────────

export function getAppSetting(key: string, fallback: string): string {
  const db = useDb()
  const row = db.select().from(appSettings).where(eq(appSettings.key, key)).get()
  return row?.value ?? fallback
}

export function setAppSetting(key: string, value: string): void {
  const db = useDb()
  const existing = db.select().from(appSettings).where(eq(appSettings.key, key)).get()
  if (existing) {
    db.update(appSettings).set({ value, updatedAt: now() }).where(eq(appSettings.key, key)).run()
  } else {
    db.insert(appSettings).values({ key, value, updatedAt: now() }).run()
  }
}

export function getConfiguredProvider(): Provider {
  const v = getAppSetting('currency_provider', 'visa').toLowerCase()
  return v === 'frankfurter' ? 'frankfurter' : 'visa'
}

export function getConfiguredDisplayCurrency(): string {
  return getAppSetting('display_currency', 'EUR').toUpperCase()
}

// ── Provider fetchers ────────────────────────────────────────────────────

/**
 * Visa's public Foreign Exchange Calculator JSON endpoint, the same one
 * powering visa.com/en_US/run-your-business/small-business-tools/foreign-exchange.html.
 * Not a documented API — Visa can change it without notice — so callers
 * MUST handle failure and fall back to another provider.
 */
async function fetchVisaRate(from: string, to: string): Promise<number> {
  const date = new Date()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const yyyy = date.getFullYear()
  const ds = `${mm}/${dd}/${yyyy}`

  const url = `https://www.visa.com/cmsapi/fx/rates?amount=1&fee=0&utcConvertedDate=${ds}&exchangedate=${ds}&fromCurr=${from}&toCurr=${to}`
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'Mozilla/5.0 (MerchTracker)',
      Referer: 'https://www.visa.com/',
    },
  })
  if (!res.ok) throw new Error(`Visa HTTP ${res.status}`)
  const json = await res.json() as {
    convertedAmount?: string | number
    originalValues?: { fromAmountWithVisaRate?: string | number }
    fxRateVisa?: string | number
  }
  // Prefer the explicit rate; otherwise derive it from the converted amount
  // (since we sent amount=1, convertedAmount IS the rate). Both fields have
  // appeared across versions of the endpoint — try whichever is present.
  const direct = json.fxRateVisa
  const converted = json.convertedAmount
  const candidate = direct ?? converted
  if (candidate === undefined || candidate === null) {
    throw new Error('Visa response missing rate fields')
  }
  const rate = typeof candidate === 'number' ? candidate : parseFloat(candidate)
  if (!Number.isFinite(rate) || rate <= 0) throw new Error(`Visa returned bad rate: ${candidate}`)
  return rate
}

/**
 * Frankfurter (https://www.frankfurter.app) — free, open-source proxy of the
 * European Central Bank's daily reference rates. No API key, generous limits.
 */
async function fetchFrankfurterRate(from: string, to: string): Promise<number> {
  // ECB doesn't quote a currency against itself; short-circuit so we don't
  // hit the endpoint and get an error back.
  if (from.toUpperCase() === to.toUpperCase()) return 1
  const url = `https://api.frankfurter.app/latest?from=${from}&to=${to}&amount=1`
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`Frankfurter HTTP ${res.status}`)
  const json = await res.json() as { rates?: Record<string, number> }
  const rate = json.rates?.[to.toUpperCase()]
  if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) {
    throw new Error(`Frankfurter response missing rate for ${to}`)
  }
  return rate
}

// ── Public API ───────────────────────────────────────────────────────────

export interface RateResult {
  from: string
  to: string
  rate: number
  fetchedAt: number
  provider: Provider
  /** True when we fell back to a different provider than the configured one. */
  fellBack: boolean
}

/**
 * Get an FX rate from `from` to `to`. Respects the configured provider, with
 * automatic fallback to Frankfurter if the primary fails. Cached per-process
 * for 12 hours; identical currency pairs return the cached entry.
 */
export async function getRate(from: string, to: string): Promise<RateResult> {
  const fromU = from.toUpperCase()
  const toU = to.toUpperCase()

  // Identity: skip the network entirely.
  if (fromU === toU) {
    return { from: fromU, to: toU, rate: 1, fetchedAt: Date.now(), provider: 'frankfurter', fellBack: false }
  }

  const configured = getConfiguredProvider()

  // Cache lookup. We cache PER PROVIDER so a provider switch invalidates the
  // old entries naturally without needing an explicit flush.
  const key = cacheKey(fromU, toU, configured)
  const cached = rateCache.get(key)
  if (cached && Date.now() - cached.fetchedAt < RATE_TTL_MS) {
    return { from: fromU, to: toU, rate: cached.rate, fetchedAt: cached.fetchedAt, provider: cached.provider, fellBack: false }
  }

  // Primary attempt.
  try {
    const rate = configured === 'visa'
      ? await fetchVisaRate(fromU, toU)
      : await fetchFrankfurterRate(fromU, toU)
    const fetchedAt = Date.now()
    rateCache.set(key, { rate, fetchedAt, provider: configured })
    return { from: fromU, to: toU, rate, fetchedAt, provider: configured, fellBack: false }
  } catch (primaryErr) {
    // Fallback: try Frankfurter if the primary wasn't already Frankfurter.
    if (configured !== 'frankfurter') {
      try {
        const rate = await fetchFrankfurterRate(fromU, toU)
        const fetchedAt = Date.now()
        const fallbackKey = cacheKey(fromU, toU, 'frankfurter')
        rateCache.set(fallbackKey, { rate, fetchedAt, provider: 'frankfurter' })
        return { from: fromU, to: toU, rate, fetchedAt, provider: 'frankfurter', fellBack: true }
      } catch (fallbackErr) {
        throw new Error(`Both ${configured} and frankfurter failed: ${(primaryErr as Error).message} / ${(fallbackErr as Error).message}`)
      }
    }
    throw primaryErr
  }
}
