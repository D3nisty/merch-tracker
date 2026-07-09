import { getConfiguredProvider, getConfiguredDisplayCurrency, getAppSetting } from '../../utils/currency'

/**
 * Returns the public-facing app settings the client needs to render UI:
 * which currency to convert prices to, which provider sources the rates, and
 * the instance defaults (new-event visibility default + whether guests may
 * browse). No authentication required — these values affect every viewer.
 */
export default defineEventHandler(() => {
  return {
    displayCurrency: getConfiguredDisplayCurrency(),
    currencyProvider: getConfiguredProvider(),
    defaultPublic: getAppSetting('default_public', 'false') === 'true',
    allowGuest: getAppSetting('allow_guest', 'true') === 'true',
  }
})
