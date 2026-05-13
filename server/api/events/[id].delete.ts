import { useDb } from '../../db'
import { events } from '../../db/schema'
import { eq, or } from 'drizzle-orm'
import { requireUser } from '../../utils/auth'

/**
 * Deleting an entire event is destructive. Only the event owner or an admin
 * may do it — edit-shared collaborators cannot.
 */
export default defineEventHandler(async (event) => {
  const idOrSlug = getRouterParam(event, 'id')!
  const db = useDb()

  const existing = db.select().from(events).where(or(eq(events.id, idOrSlug), eq(events.slug, idOrSlug))).get()
  if (!existing) throw createError({ statusCode: 404, message: 'Event not found' })

  const user = await requireUser(event)
  if (user.role !== 'admin' && existing.ownerId !== user.id) {
    throw createError({ statusCode: 403, message: 'Only the event owner or an admin can delete an event' })
  }

  db.delete(events).where(eq(events.id, existing.id)).run()

  return { success: true }
})
