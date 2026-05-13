import { useDb } from '../../db'
import { locations } from '../../db/schema'
import { eq } from 'drizzle-orm'
import { requireEventEdit } from '../../utils/permissions'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const db = useDb()

  const existing = db.select().from(locations).where(eq(locations.id, id)).get()
  if (!existing) throw createError({ statusCode: 404, message: 'Location not found' })

  await requireEventEdit(event, existing.eventId)

  db.delete(locations).where(eq(locations.id, id)).run()

  return { success: true }
})
