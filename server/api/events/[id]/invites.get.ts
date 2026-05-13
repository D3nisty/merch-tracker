import { useDb } from '../../../db'
import { events, eventInvites } from '../../../db/schema'
import { eq, or } from 'drizzle-orm'
import { requireUser } from '../../../utils/auth'

/**
 * List active invite tokens for an event. Owner or admin only.
 */
export default defineEventHandler(async (event) => {
  const idOrSlug = getRouterParam(event, 'id')!
  const db = useDb()
  const evt = db.select().from(events).where(or(eq(events.id, idOrSlug), eq(events.slug, idOrSlug))).get()
  if (!evt) throw createError({ statusCode: 404, message: 'Event not found' })

  const me = await requireUser(event)
  if (me.role !== 'admin' && evt.ownerId !== me.id) {
    throw createError({ statusCode: 403, message: 'Only the event owner or an admin can manage invites' })
  }

  const now = new Date().toISOString()
  const rows = db.select().from(eventInvites).where(eq(eventInvites.eventId, evt.id)).orderBy(eventInvites.createdAt).all()
  return rows
    .filter(r => !r.expiresAt || r.expiresAt > now)
    .map(r => ({ ...r, token: r.token })) // include token so the UI can rebuild the URL
})
