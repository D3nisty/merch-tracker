import { useDb } from '../../db'
import { products } from '../../db/schema'
import { eq } from 'drizzle-orm'
import { now } from '../../utils/id'
import { requireBoothEdit } from '../../utils/permissions'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const db = useDb()

  const existing = db.select().from(products).where(eq(products.id, id)).get()
  if (!existing) throw createError({ statusCode: 404, message: 'Product not found' })

  // The product carries its booth directly, so we can gate at booth level
  // without an extra event-walk SELECT. requireBoothEdit handles the
  // permission cascade (event-edit OR booth-edit-share).
  await requireBoothEdit(event, existing.boothId)
  const body = await readBody(event)

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
