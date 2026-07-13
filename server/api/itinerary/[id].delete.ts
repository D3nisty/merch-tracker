import { useDb } from '../../db'
import { itineraryItems } from '../../db/schema'
import { eq } from 'drizzle-orm'
import { requireEventEdit } from '../../utils/permissions'
import { deleteUploadedFile } from '../../utils/uploads'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const db = useDb()
  const existing = db.select().from(itineraryItems).where(eq(itineraryItems.id, id)).get()
  if (!existing) throw createError({ statusCode: 404, message: 'Itinerary item not found' })

  await requireEventEdit(event, existing.eventId)

  db.delete(itineraryItems).where(eq(itineraryItems.id, id)).run()
  if (existing.attachmentPath) await deleteUploadedFile(existing.attachmentPath)

  return { success: true }
})
