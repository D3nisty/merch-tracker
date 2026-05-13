import { useDb } from '../../db'
import { catalogImages } from '../../db/schema'
import { eq } from 'drizzle-orm'
import { requireRole } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  await requireRole(event, ['admin', 'editor'])
  const id = getRouterParam(event, 'id')!
  const db = useDb()

  const existing = db.select().from(catalogImages).where(eq(catalogImages.id, id)).get()
  if (!existing) throw createError({ statusCode: 404, message: 'Image not found' })

  db.delete(catalogImages).where(eq(catalogImages.id, id)).run()

  return { success: true }
})
