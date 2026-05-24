import { useDb } from '../../db'
import { locationReceipts } from '../../db/schema'
import { eq } from 'drizzle-orm'
import { requireEventEdit, eventIdForLocation } from '../../utils/permissions'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const body = await readBody(event)
  const db = useDb()

  const existing = db.select().from(locationReceipts).where(eq(locationReceipts.id, id)).get()
  if (!existing) throw createError({ statusCode: 404, message: 'Receipt not found' })

  const eventId = await eventIdForLocation(existing.locationId)
  if (!eventId) throw createError({ statusCode: 404, message: 'Parent event not found' })
  await requireEventEdit(event, eventId)

  const updates: Partial<typeof existing> = {}
  if (typeof body.customName === 'string' || body.customName === null) {
    updates.customName = body.customName?.trim() || null
  }
  if (body.displayMode === 'full' || body.displayMode === 'split') {
    updates.displayMode = body.displayMode
  }
  if (typeof body.splitCount === 'number' && body.splitCount >= 2 && body.splitCount <= 10) {
    updates.splitCount = body.splitCount
  }

  if (Object.keys(updates).length) {
    db.update(locationReceipts).set(updates).where(eq(locationReceipts.id, id)).run()
  }

  return db.select().from(locationReceipts).where(eq(locationReceipts.id, id)).get()
})
