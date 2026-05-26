import { useDb } from '../../db'
import { locationReceipts, locationReceiptItems } from '../../db/schema'
import { eq } from 'drizzle-orm'
import { requireEventEdit, eventIdForLocation } from '../../utils/permissions'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const db = useDb()
  const existing = db.select().from(locationReceiptItems).where(eq(locationReceiptItems.id, id)).get()
  if (!existing) throw createError({ statusCode: 404, message: 'Item not found' })

  const receipt = db.select().from(locationReceipts).where(eq(locationReceipts.id, existing.receiptId)).get()
  if (!receipt) throw createError({ statusCode: 404, message: 'Parent receipt missing' })
  const eventId = await eventIdForLocation(receipt.locationId)
  if (!eventId) throw createError({ statusCode: 404, message: 'Parent event missing' })
  await requireEventEdit(event, eventId)

  db.delete(locationReceiptItems).where(eq(locationReceiptItems.id, id)).run()
  return { success: true }
})
