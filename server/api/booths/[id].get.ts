import { useDb } from '../../db'
import { booths, products, catalogImages } from '../../db/schema'
import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const db = useDb()

  const booth = db.select().from(booths).where(eq(booths.id, id)).get()
  if (!booth) throw createError({ statusCode: 404, message: 'Booth not found' })

  const boothProducts = db.select().from(products).where(eq(products.boothId, id)).all()
  const images = db
    .select()
    .from(catalogImages)
    .where(eq(catalogImages.boothId, id))
    .orderBy(catalogImages.sortOrder)
    .all()

  return { ...booth, products: boothProducts, images }
})
