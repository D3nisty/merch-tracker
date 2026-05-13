import { useDb } from '../../../db'
import { catalogImages, products } from '../../../db/schema'
import { eq } from 'drizzle-orm'
import { requireEventEdit, eventIdForImage, eventIdForBooth } from '../../../utils/permissions'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const { boothId } = await readBody(event)
  if (!boothId) throw createError({ statusCode: 400, message: 'boothId is required' })

  const db = useDb()
  const existing = db.select().from(catalogImages).where(eq(catalogImages.id, id)).get()
  if (!existing) throw createError({ statusCode: 404, message: 'Image not found' })

  // Moving an image requires edit on both source and destination events.
  const sourceEventId = await eventIdForImage(existing.id)
  const destEventId = await eventIdForBooth(boothId)
  if (!sourceEventId || !destEventId) throw createError({ statusCode: 404, message: 'Booth or image not found' })
  await requireEventEdit(event, sourceEventId)
  if (destEventId !== sourceEventId) await requireEventEdit(event, destEventId)

  db.update(catalogImages).set({ boothId }).where(eq(catalogImages.id, id)).run()
  db.update(catalogImages).set({ boothId }).where(eq(catalogImages.parentId, id)).run()
  db.update(products).set({ boothId }).where(eq(products.catalogImageId, id)).run()

  return { success: true }
})
