import { getConfiguredProvider, getConfiguredDisplayCurrency } from '../../utils/currency'

/**
 * Returns the public-facing app settings the client needs to render UI:
 * which currency to convert prices to, and which provider sources the rates.
 * No authentication required — these values affect every viewer regardless
 * of login state.
 */
export default defineEventHandler(() => {
  return {
    displayCurrency: getConfiguredDisplayCurrency(),
    currencyProvider: getConfiguredProvider(),
  }
})
