import { useDb } from '../../../db'
import { locationReceipts, locationReceiptItems, locationReceiptItemMarks } from '../../../db/schema'
import { eq, and } from 'drizzle-orm'
import { generateId, now } from '../../../utils/id'
import { requireUser } from '../../../utils/auth'
import { canEditEvent, canViewEvent, eventIdForLocation } from '../../../utils/permissions'

/**
 * Set/unset a person's claim on a receipt item. Body: `{ personId, quantity? }`.
 * `quantity <= 0` removes the row (un-claim); a positive integer creates or
 * updates the mark.
 *
 * Permission model mirrors `POST /api/products/[id]/marks`: any logged-in
 * viewer with event-view access can mark for THEIR OWN person; editors can
 * mark on behalf of anyone (useful for the receipt owner cleaning up).
 */
export default defineEventHandler(async (event) => {
  const itemId = getRouterParam(event, 'id')!
  const body = await readBody(event) as { personId?: string; quantity?: number }

  const personId = body.personId
  if (!personId) throw createError({ statusCode: 400, message: 'personId is required' })

  const db = useDb()
  const item = db.select().from(locationReceiptItems).where(eq(locationReceiptItems.id, itemId)).get()
  if (!item) throw createError({ statusCode: 404, message: 'Item not found' })

  const receipt = db.select().from(locationReceipts).where(eq(locationReceipts.id, item.receiptId)).get()
  if (!receipt) throw createError({ statusCode: 404, message: 'Parent receipt missing' })
  const eventId = await eventIdForLocation(receipt.locationId)
  if (!eventId) throw createError({ statusCode: 404, message: 'Parent event missing' })

  const user = await requireUser(event)
  if (!(await canViewEvent(user, eventId))) {
    throw createError({ statusCode: 403, message: 'No access to this event' })
  }
  // Only editors can mark on someone else's behalf.
  if (user.personId !== personId && !(await canEditEvent(user, eventId))) {
    throw createError({ statusCode: 403, message: 'You can only assign items to yourself' })
  }

  const qty = typeof body.quantity === 'number' ? Math.floor(body.quantity) : 1
  const ts = now()

  const existing = db.select().from(locationReceiptItemMarks)
    .where(and(eq(locationReceiptItemMarks.itemId, itemId), eq(locationReceiptItemMarks.personId, personId)))
    .get()

  if (qty <= 0) {
    if (existing) db.delete(locationReceiptItemMarks).where(eq(locationReceiptItemMarks.id, existing.id)).run()
  } else if (existing) {
    db.update(locationReceiptItemMarks).set({ quantity: qty }).where(eq(locationReceiptItemMarks.id, existing.id)).run()
  } else {
    db.insert(locationReceiptItemMarks).values({
      id: generateId(),
      itemId,
      personId,
      quantity: qty,
      createdAt: ts,
    }).run()
  }

  // Return the fresh mark set for this item so the client can sync state
  // without a separate GET round-trip.
  const marks = db.select().from(locationReceiptItemMarks)
    .where(eq(locationReceiptItemMarks.itemId, itemId))
    .all()
  return { itemId, marks }
})
