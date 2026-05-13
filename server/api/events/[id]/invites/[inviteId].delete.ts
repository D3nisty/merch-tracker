import { useDb } from '../../../../db'
import { events, eventInvites } from '../../../../db/schema'
import { eq, or } from 'drizzle-orm'
import { requireUser } from '../../../../utils/auth'

export default defineEventHandler(async (event) => {
  const idOrSlug = getRouterParam(event, 'id')!
  const inviteId = getRouterParam(event, 'inviteId')!
  const db = useDb()

  const evt = db.select().from(events).where(or(eq(events.id, idOrSlug), eq(events.slug, idOrSlug))).get()
  if (!evt) throw createError({ statusCode: 404, message: 'Event not found' })

  const me = await requireUser(event)
  if (me.role !== 'admin' && evt.ownerId !== me.id) {
    throw createError({ statusCode: 403, message: 'Only the event owner or an admin can revoke invites' })
  }

  const invite = db.select().from(eventInvites).where(eq(eventInvites.id, inviteId)).get()
  if (!invite || invite.eventId !== evt.id) {
    throw createError({ statusCode: 404, message: 'Invite not found' })
  }
  db.delete(eventInvites).where(eq(eventInvites.id, inviteId)).run()
  return { success: true }
})
