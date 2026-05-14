import { useDb } from '../../../db'
import { catalogImages, products } from '../../../db/schema'
import { eq } from 'drizzle-orm'
import { requireBoothEdit, eventIdForBooth } from '../../../utils/permissions'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const { boothId } = await readBody(event)
  if (!boothId) throw createError({ statusCode: 400, message: 'boothId is required' })

  const db = useDb()
  const existing = db.select().from(catalogImages).where(eq(catalogImages.id, id)).get()
  if (!existing) throw createError({ statusCode: 404, message: 'Image not found' })

  // Moving an image requires edit on BOTH source and destination booths so a
  // booth-share user can't relocate an image out of (or into) a booth they
  // shouldn't touch. eventIdForBooth doubles as an existence check.
  const destEventId = await eventIdForBooth(boothId)
  if (!destEventId) throw createError({ statusCode: 404, message: 'Booth not found' })
  await requireBoothEdit(event, existing.boothId)
  if (boothId !== existing.boothId) await requireBoothEdit(event, boothId)

  db.update(catalogImages).set({ boothId }).where(eq(catalogImages.id, id)).run()
  db.update(catalogImages).set({ boothId }).where(eq(catalogImages.parentId, id)).run()
  db.update(products).set({ boothId }).where(eq(products.catalogImageId, id)).run()

  return { success: true }
})
