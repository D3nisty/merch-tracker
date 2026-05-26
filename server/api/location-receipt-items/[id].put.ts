import { useDb } from '../../db'
import { locationReceipts, locationReceiptItems } from '../../db/schema'
import { eq } from 'drizzle-orm'
import { requireEventEdit, eventIdForLocation } from '../../utils/permissions'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const body = await readBody(event) as { name?: string; price?: number | null; currency?: string; splitAmongMarked?: boolean }

  const db = useDb()
  const existing = db.select().from(locationReceiptItems).where(eq(locationReceiptItems.id, id)).get()
  if (!existing) throw createError({ statusCode: 404, message: 'Item not found' })

  const receipt = db.select().from(locationReceipts).where(eq(locationReceipts.id, existing.receiptId)).get()
  if (!receipt) throw createError({ statusCode: 404, message: 'Parent receipt missing' })
  const eventId = await eventIdForLocation(receipt.locationId)
  if (!eventId) throw createError({ statusCode: 404, message: 'Parent event missing' })
  await requireEventEdit(event, eventId)

  const updates: Partial<typeof existing> = {}
  if (typeof body.name === 'string') {
    const v = body.name.trim()
    if (!v) throw createError({ statusCode: 400, message: 'name cannot be empty' })
    updates.name = v
  }
  if (body.price === null) updates.price = null
  else if (typeof body.price === 'number' && Number.isFinite(body.price)) updates.price = body.price
  if (typeof body.currency === 'string' && /^[A-Z]{3}$/.test(body.currency.toUpperCase())) {
    updates.currency = body.currency.toUpperCase()
  }
  if (typeof body.splitAmongMarked === 'boolean') {
    updates.splitAmongMarked = body.splitAmongMarked
  }

  if (Object.keys(updates).length) {
    db.update(locationReceiptItems).set(updates).where(eq(locationReceiptItems.id, id)).run()
  }
  return db.select().from(locationReceiptItems).where(eq(locationReceiptItems.id, id)).get()
})
