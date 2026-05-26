import { useDb } from '../../../db'
import { locationReceipts, locationReceiptItems } from '../../../db/schema'
import { eq, max } from 'drizzle-orm'
import { generateId, now } from '../../../utils/id'
import { requireEventEdit, eventIdForLocation } from '../../../utils/permissions'

/**
 * Create an ad-hoc item on a city receipt. Body: `{ name, price?, currency? }`.
 * Item assignment to persons happens via POST /api/location-receipt-items/[id]/marks.
 */
export default defineEventHandler(async (event) => {
  const receiptId = getRouterParam(event, 'id')!
  const body = await readBody(event) as { name?: string; price?: number | null; currency?: string }

  const receipt = useDb().select().from(locationReceipts).where(eq(locationReceipts.id, receiptId)).get()
  if (!receipt) throw createError({ statusCode: 404, message: 'Receipt not found' })

  const eventId = await eventIdForLocation(receipt.locationId)
  if (!eventId) throw createError({ statusCode: 404, message: 'Parent event not found' })
  await requireEventEdit(event, eventId)

  const name = (body.name ?? '').trim()
  if (!name) throw createError({ statusCode: 400, message: 'name is required' })

  const price = typeof body.price === 'number' && Number.isFinite(body.price) ? body.price : null
  const currency = typeof body.currency === 'string' && /^[A-Z]{3}$/.test(body.currency.toUpperCase())
    ? body.currency.toUpperCase()
    : 'EUR'

  const db = useDb()
  const maxResult = db.select({ m: max(locationReceiptItems.sortOrder) })
    .from(locationReceiptItems)
    .where(eq(locationReceiptItems.receiptId, receiptId))
    .get()
  const nextOrder = (maxResult?.m ?? -10) + 10

  const newItem = {
    id: generateId(),
    receiptId,
    name,
    price,
    currency,
    sortOrder: nextOrder,
    createdAt: now(),
  }
  db.insert(locationReceiptItems).values(newItem).run()
  return newItem
})
