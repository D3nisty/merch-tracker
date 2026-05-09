import { useDb } from '../../db'
import { catalogImages } from '../../db/schema'
import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const body = await readBody(event)
  const db = useDb()

  const existing = db.select().from(catalogImages).where(eq(catalogImages.id, id)).get()
  if (!existing) throw createError({ statusCode: 404, message: 'Image not found' })

  const updated = {
    displayMode: body.displayMode ?? existing.displayMode,
    splitCount: body.splitCount ?? existing.splitCount,
    sortOrder: body.sortOrder ?? existing.sortOrder,
  }

  db.update(catalogImages).set(updated).where(eq(catalogImages.id, id)).run()

  return { ...existing, ...updated }
})
