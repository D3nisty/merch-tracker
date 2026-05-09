import { useDb } from '../../db'
import { products } from '../../db/schema'
import { eq } from 'drizzle-orm'
import { now } from '../../utils/id'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const body = await readBody(event)
  const db = useDb()

  const existing = db.select().from(products).where(eq(products.id, id)).get()
  if (!existing) throw createError({ statusCode: 404, message: 'Product not found' })

  const updated: Partial<typeof existing> = { updatedAt: now() }

  const fields = [
    'name', 'description', 'price', 'currency', 'quantity',
    'size', 'category', 'isPurchased', 'isPlanned', 'priority', 'notes', 'website',
    'catalogImageId', 'personId', 'regionX', 'regionY', 'regionW', 'regionH',
  ] as const

  for (const field of fields) {
    if (body[field] !== undefined) {
      (updated as Record<string, unknown>)[field] = body[field]
    }
  }

  db.update(products).set(updated).where(eq(products.id, id)).run()

  return { ...existing, ...updated }
})
