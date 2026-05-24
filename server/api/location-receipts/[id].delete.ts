import { useDb } from '../../db'
import { locationReceipts } from '../../db/schema'
import { eq } from 'drizzle-orm'
import { requireEventEdit, eventIdForLocation } from '../../utils/permissions'
import { deleteUploadedFile } from '../../utils/uploads'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const db = useDb()

  const existing = db.select().from(locationReceipts).where(eq(locationReceipts.id, id)).get()
  if (!existing) throw createError({ statusCode: 404, message: 'Receipt not found' })

  const eventId = await eventIdForLocation(existing.locationId)
  if (!eventId) throw createError({ statusCode: 404, message: 'Parent event not found' })
  await requireEventEdit(event, eventId)

  db.delete(locationReceipts).where(eq(locationReceipts.id, id)).run()
  await deleteUploadedFile(existing.path)

  return { success: true }
})
