import { requireRole } from '../../../utils/auth'
import { setAppSetting, clearRateCache, getConfiguredProvider, getConfiguredDisplayCurrency, getAppSetting } from '../../../utils/currency'

/**
 * Update one or both currency settings. Body shape: `{ currencyProvider?,
 * displayCurrency? }`. Each field is validated; unknown providers and
 * non-ISO display currencies are rejected.
 *
 * Whenever a setting changes the in-process rate cache is cleared so the
 * next /api/currency/rate call hits the freshly-configured provider.
 */
export default defineEventHandler(async (event) => {
  await requireRole(event, ['admin'])
  const body = await readBody(event) as {
    currencyProvider?: string
    displayCurrency?: string
    defaultPublic?: boolean
    allowGuest?: boolean
  }

  let changed = false

  if (typeof body.defaultPublic === 'boolean') {
    setAppSetting('default_public', body.defaultPublic ? 'true' : 'false')
  }
  if (typeof body.allowGuest === 'boolean') {
    setAppSetting('allow_guest', body.allowGuest ? 'true' : 'false')
  }

  if (typeof body.currencyProvider === 'string') {
    const v = body.currencyProvider.toLowerCase()
    if (v !== 'visa' && v !== 'frankfurter') {
      throw createError({ statusCode: 400, message: 'currencyProvider must be "visa" or "frankfurter"' })
    }
    setAppSetting('currency_provider', v)
    changed = true
  }

  if (typeof body.displayCurrency === 'string') {
    const v = body.displayCurrency.toUpperCase()
    if (!/^[A-Z]{3}$/.test(v)) {
      throw createError({ statusCode: 400, message: 'displayCurrency must be a 3-letter ISO code' })
    }
    setAppSetting('display_currency', v)
    changed = true
  }

  if (changed) clearRateCache()

  return {
    currencyProvider: getConfiguredProvider(),
    displayCurrency: getConfiguredDisplayCurrency(),
    defaultPublic: getAppSetting('default_public', 'false') === 'true',
    allowGuest: getAppSetting('allow_guest', 'true') === 'true',
  }
})
