import { requireRole } from '../../../utils/auth'
import { getConfiguredProvider, getConfiguredDisplayCurrency, getAppSetting } from '../../../utils/currency'

export default defineEventHandler(async (event) => {
  await requireRole(event, ['admin'])
  return {
    currencyProvider: getConfiguredProvider(),
    displayCurrency: getConfiguredDisplayCurrency(),
    defaultPublic: getAppSetting('default_public', 'false') === 'true',
    allowGuest: getAppSetting('allow_guest', 'true') === 'true',
  }
})
