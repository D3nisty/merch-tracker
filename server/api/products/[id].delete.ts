import { useDb } from '../../db'
import { products } from '../../db/schema'
import { eq } from 'drizzle-orm'
import { requireEventEdit, eventIdForProduct } from '../../utils/permissions'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const db = useDb()

  const existing = db.select().from(products).where(eq(products.id, id)).get()
  if (!existing) throw createError({ statusCode: 404, message: 'Product not found' })

  const eventId = await eventIdForProduct(existing.id)
  if (!eventId) throw createError({ statusCode: 404, message: 'Product not found' })
  await requireEventEdit(event, eventId)

  db.delete(products).where(eq(products.id, id)).run()

  return { success: true }
})
