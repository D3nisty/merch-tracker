import { useDb } from '../../db'
import { eventInvites, events } from '../../db/schema'
import { eq } from 'drizzle-orm'

/**
 * Introspect a token. Public — the landing page needs to show event name
 * and invite level before the user decides to accept or sign up.
 * Returns 404 for unknown/expired tokens so they can't be enumerated.
 */
export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token')!
  const db = useDb()

  const invite = db.select().from(eventInvites).where(eq(eventInvites.token, token)).get()
  if (!invite) throw createError({ statusCode: 404, message: 'Invite not found' })
  if (invite.expiresAt && new Date(invite.expiresAt).getTime() < Date.now()) {
    throw createError({ statusCode: 410, message: 'Invite has expired' })
  }

  const evt = db.select({
    id: events.id,
    slug: events.slug,
    name: events.name,
    type: events.type,
    location: events.location,
  }).from(events).where(eq(events.id, invite.eventId)).get()
  if (!evt) throw createError({ statusCode: 404, message: 'Event no longer exists' })

  return { level: invite.level, event: evt }
})
