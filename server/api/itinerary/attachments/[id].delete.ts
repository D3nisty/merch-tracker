import { useDb } from '../../../db'
import { itineraryItems, itineraryAttachments } from '../../../db/schema'
import { eq } from 'drizzle-orm'
import { requireEventEdit } from '../../../utils/permissions'
import { deleteUploadedFile } from '../../../utils/uploads'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const db = useDb()
  const att = db.select().from(itineraryAttachments).where(eq(itineraryAttachments.id, id)).get()
  if (!att) throw createError({ statusCode: 404, message: 'Attachment not found' })

  const item = db.select({ eventId: itineraryItems.eventId }).from(itineraryItems).where(eq(itineraryItems.id, att.itemId)).get()
  if (!item) throw createError({ statusCode: 404, message: 'Itinerary item not found' })
  await requireEventEdit(event, item.eventId)

  db.delete(itineraryAttachments).where(eq(itineraryAttachments.id, id)).run()
  await deleteUploadedFile(att.path)
  return { success: true }
})
