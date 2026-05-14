import { useDb } from '../../db'
import { boothDiscounts } from '../../db/schema'
import { eq } from 'drizzle-orm'
import { requireEventEdit, eventIdForDiscount } from '../../utils/permissions'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const db = useDb()

  const existing = db.select().from(boothDiscounts).where(eq(boothDiscounts.id, id)).get()
  if (!existing) throw createError({ statusCode: 404, message: 'Discount not found' })

  const eventId = await eventIdForDiscount(id)
  if (!eventId) throw createError({ statusCode: 404, message: 'Discount not found' })
  await requireEventEdit(event, eventId)

  const body = await readBody(event) as Partial<typeof existing>
  const next: Partial<typeof existing> = {}
  if (typeof body.label === 'string' && body.label.trim()) next.label = body.label.trim()
  if (body.scopeType === 'size' || body.scopeType === 'category') next.scopeType = body.scopeType
  if (typeof body.scopeValue === 'string' && body.scopeValue.trim()) next.scopeValue = body.scopeValue.trim()
  if (Number.isInteger(body.triggerQty) && (body.triggerQty as number) >= 2) next.triggerQty = body.triggerQty as number
  if (body.type === 'buy_get_free' || body.type === 'bundle') next.type = body.type
  if (Number.isInteger(body.freeQty) && (body.freeQty as number) >= 1) next.freeQty = body.freeQty as number
  if (typeof body.bundlePrice === 'number' && body.bundlePrice >= 0) next.bundlePrice = body.bundlePrice
  if (typeof body.bundleCurrency === 'string' && body.bundleCurrency.trim()) next.bundleCurrency = body.bundleCurrency.trim().toUpperCase()

  const merged = { ...existing, ...next }
  if (merged.type === 'buy_get_free') {
    if (!merged.freeQty || merged.freeQty < 1 || merged.freeQty >= merged.triggerQty) {
      throw createError({ statusCode: 400, message: 'freeQty must be ≥ 1 and < triggerQty for buy_get_free' })
    }
    // Clear bundle fields when switching back to buy_get_free
    next.bundlePrice = null
    next.bundleCurrency = null
  } else if (merged.type === 'bundle') {
    if (merged.bundlePrice == null || merged.bundlePrice < 0) {
      throw createError({ statusCode: 400, message: 'bundlePrice required and non-negative for bundle' })
    }
    if (!merged.bundleCurrency) {
      throw createError({ statusCode: 400, message: 'bundleCurrency required for bundle' })
    }
    // freeQty is unused for bundle; keep at 0 (column may have NOT NULL on legacy DBs)
    next.freeQty = 0
  }

  if (Object.keys(next).length === 0) return existing
  db.update(boothDiscounts).set(next).where(eq(boothDiscounts.id, id)).run()
  return { ...existing, ...next }
})
