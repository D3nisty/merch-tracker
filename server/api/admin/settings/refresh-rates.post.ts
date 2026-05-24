import { requireRole } from '../../../utils/auth'
import { clearRateCache } from '../../../utils/currency'

/**
 * Manually flush the in-memory rate cache. Useful if an admin wants
 * "current" rates before the 12h TTL would naturally expire.
 */
export default defineEventHandler(async (event) => {
  await requireRole(event, ['admin'])
  clearRateCache()
  return { success: true }
})
