import { requireRole } from '../../../utils/auth'
import { getConfiguredProvider, getConfiguredDisplayCurrency } from '../../../utils/currency'

export default defineEventHandler(async (event) => {
  await requireRole(event, ['admin'])
  return {
    currencyProvider: getConfiguredProvider(),
    displayCurrency: getConfiguredDisplayCurrency(),
  }
})
