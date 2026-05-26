import { useDb } from '../db'
import { appSettings } from '../db/schema'
import { eq } from 'drizzle-orm'
import { now } from './id'

/**
 * Currency conversion utility. Reads the admin-configured provider from
 * `app_settings`, fetches rates from either Visa's public widget endpoint or
 * Frankfurter (ECB), and caches the result in-process.
 *
 * Historical rates: pass an optional ISO date (`YYYY-MM-DD`) to `getRate` and
 * the providers' historical endpoints are used instead of the latest rate.
 * Settlement math uses this so debts converted across receipts reflect the
 * exchange rate as of the day each receipt was paid, not the current rate
 * (which would drift over time and mis-state historical purchases).
 *
 * Cache TTL is split: "latest" rates expire after 12 hours (rates move),
 * historical-date rates are cached effectively forever — once published by
 * the ECB / Visa for a past date they don't change.
 *
 * Visa's endpoint is undocumented and could change. When Visa is configured
 * but a call fails, `getRate` transparently falls back to Frankfurter so
 * the app keeps rendering.
 */

export type Provider = 'visa' | 'frankfurter'

const LATEST_TTL_MS = 12 * 60 * 60 * 1000 // 12h for "today" rates
const HISTORICAL_TTL_MS = 365 * 24 * 60 * 60 * 1000 // 1y, effectively forever for past dates

interface CachedRate {
  rate: number
  fetchedAt: number // epoch ms
  provider: Provider
}

const rateCache = new Map<string, CachedRate>()

/** Treat anything before today (UTC) as historical; today resolves to 'latest'. */
function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}
function normalizeDate(date: string | undefined): string {
  if (!date) return 'latest'
  // Accept YYYY-MM-DD or full ISO timestamps; strip to date.
  const iso = date.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return 'latest'
  return iso >= todayISO() ? 'latest' : iso
}

function cacheKey(from: string, to: string, provider: Provider, date: string): string {
  return `${provider}:${from.toUpperCase()}->${to.toUpperCase()}@${date}`
}
function ttlFor(date: string): number {
  return date === 'latest' ? LATEST_TTL_MS : HISTORICAL_TTL_MS
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
 * Visa's public Foreign Exchange Calculator JSON endpoint. Supports both
 * latest and historical rates via the `exchangedate` MM/DD/YYYY parameter
 * (the same field the public widget uses for its date picker).
 */
async function fetchVisaRate(from: string, to: string, date: string): Promise<number> {
  // date is either 'latest' or 'YYYY-MM-DD'. Visa wants MM/DD/YYYY.
  const d = date === 'latest' ? new Date() : new Date(`${date}T00:00:00Z`)
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(d.getUTCDate()).padStart(2, '0')
  const yyyy = d.getUTCFullYear()
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
 * Frankfurter — https://www.frankfurter.app. Latest rates at `/latest`,
 * historical at `/<YYYY-MM-DD>`. Both accept the same `from` / `to` / `amount`
 * query string.
 */
async function fetchFrankfurterRate(from: string, to: string, date: string): Promise<number> {
  if (from.toUpperCase() === to.toUpperCase()) return 1
  const path = date === 'latest' ? 'latest' : date
  const url = `https://api.frankfurter.app/${path}?from=${from}&to=${to}&amount=1`
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
  /** Resolved date used for the lookup. `'latest'` if no date was requested or the
   *  requested date was today. Otherwise `YYYY-MM-DD`. */
  date: string
  rate: number
  fetchedAt: number
  provider: Provider
  /** True when we fell back to a different provider than the configured one. */
  fellBack: boolean
}

/**
 * Get an FX rate from `from` to `to`, optionally as of a historical `date`
 * (ISO `YYYY-MM-DD` or any prefix of an ISO timestamp). Falls back to
 * Frankfurter if the configured provider throws. Cached per (provider, pair,
 * date) — historical dates are cached effectively forever since past rates
 * don't change.
 */
export async function getRate(from: string, to: string, date?: string): Promise<RateResult> {
  const fromU = from.toUpperCase()
  const toU = to.toUpperCase()
  const dateKey = normalizeDate(date)

  // Identity: skip the network entirely.
  if (fromU === toU) {
    return { from: fromU, to: toU, date: dateKey, rate: 1, fetchedAt: Date.now(), provider: 'frankfurter', fellBack: false }
  }

  const configured = getConfiguredProvider()
  const ttl = ttlFor(dateKey)

  // Cache lookup. Per (provider, pair, date) — provider switch and date
  // switch both naturally invalidate without an explicit flush.
  const key = cacheKey(fromU, toU, configured, dateKey)
  const cached = rateCache.get(key)
  if (cached && Date.now() - cached.fetchedAt < ttl) {
    return { from: fromU, to: toU, date: dateKey, rate: cached.rate, fetchedAt: cached.fetchedAt, provider: cached.provider, fellBack: false }
  }

  // Primary attempt.
  try {
    const rate = configured === 'visa'
      ? await fetchVisaRate(fromU, toU, dateKey)
      : await fetchFrankfurterRate(fromU, toU, dateKey)
    const fetchedAt = Date.now()
    rateCache.set(key, { rate, fetchedAt, provider: configured })
    return { from: fromU, to: toU, date: dateKey, rate, fetchedAt, provider: configured, fellBack: false }
  } catch (primaryErr) {
    if (configured !== 'frankfurter') {
      try {
        const rate = await fetchFrankfurterRate(fromU, toU, dateKey)
        const fetchedAt = Date.now()
        const fallbackKey = cacheKey(fromU, toU, 'frankfurter', dateKey)
        rateCache.set(fallbackKey, { rate, fetchedAt, provider: 'frankfurter' })
        return { from: fromU, to: toU, date: dateKey, rate, fetchedAt, provider: 'frankfurter', fellBack: true }
      } catch (fallbackErr) {
        throw new Error(`Both ${configured} and frankfurter failed: ${(primaryErr as Error).message} / ${(fallbackErr as Error).message}`)
      }
    }
    throw primaryErr
  }
}
