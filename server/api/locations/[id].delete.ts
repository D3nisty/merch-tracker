import { useDb } from '../../db'
import { locations } from '../../db/schema'
import { eq } from 'drizzle-orm'
import { requireRole } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  await requireRole(event, ['admin', 'editor'])
  const id = getRouterParam(event, 'id')!
  const db = useDb()

  const existing = db.select().from(locations).where(eq(locations.id, id)).get()
  if (!existing) throw createError({ statusCode: 404, message: 'Location not found' })

  db.delete(locations).where(eq(locations.id, id)).run()

  return { success: true }
})
