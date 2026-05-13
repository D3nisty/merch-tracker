import { useDb } from '../../db'
import { products } from '../../db/schema'
import { eq } from 'drizzle-orm'
import { requireRole } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  await requireRole(event, ['admin', 'editor'])
  const id = getRouterParam(event, 'id')!
  const db = useDb()

  const existing = db.select().from(products).where(eq(products.id, id)).get()
  if (!existing) throw createError({ statusCode: 404, message: 'Product not found' })

  db.delete(products).where(eq(products.id, id)).run()

  return { success: true }
})
