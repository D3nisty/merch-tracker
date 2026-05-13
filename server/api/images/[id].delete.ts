import { useDb } from '../../db'
import { catalogImages } from '../../db/schema'
import { eq } from 'drizzle-orm'
import { requireEventEdit, eventIdForImage } from '../../utils/permissions'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const db = useDb()

  const existing = db.select().from(catalogImages).where(eq(catalogImages.id, id)).get()
  if (!existing) throw createError({ statusCode: 404, message: 'Image not found' })

  const eventId = await eventIdForImage(existing.id)
  if (!eventId) throw createError({ statusCode: 404, message: 'Image not found' })
  await requireEventEdit(event, eventId)

  db.delete(catalogImages).where(eq(catalogImages.id, id)).run()

  return { success: true }
})
