import { useDb } from '../../db'
import { events } from '../../db/schema'
import { eq, or } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const idOrSlug = getRouterParam(event, 'id')!
  const db = useDb()

  const existing = db.select().from(events).where(or(eq(events.id, idOrSlug), eq(events.slug, idOrSlug))).get()
  if (!existing) throw createError({ statusCode: 404, message: 'Event not found' })

  db.delete(events).where(eq(events.id, existing.id)).run()

  return { success: true }
})
