import { randomBytes } from 'node:crypto'
import { useDb } from '../../../db'
import { events, eventInvites } from '../../../db/schema'
import { eq, or } from 'drizzle-orm'
import { generateId, now } from '../../../utils/id'
import { requireUser } from '../../../utils/auth'

/**
 * Mint a new invite token for an event. Owner or admin only.
 *
 * Body: { level: 'view' | 'edit', expiresInHours?: number }
 *
 * Multi-use: anyone with the link can redeem it (creates an event_share for
 * their account) until the owner revokes it or it expires. We don't track
 * usage count — a single link can onboard many people.
 */
export default defineEventHandler(async (event) => {
  const idOrSlug = getRouterParam(event, 'id')!
  const db = useDb()
  const evt = db.select().from(events).where(or(eq(events.id, idOrSlug), eq(events.slug, idOrSlug))).get()
  if (!evt) throw createError({ statusCode: 404, message: 'Event not found' })

  const me = await requireUser(event)
  if (me.role !== 'admin' && evt.ownerId !== me.id) {
    throw createError({ statusCode: 403, message: 'Only the event owner or an admin can mint invites' })
  }

  const body = await readBody(event)
  const level: 'view' | 'edit' = body?.level === 'edit' ? 'edit' : 'view'
  const hours = Number(body?.expiresInHours)
  const expiresAt = Number.isFinite(hours) && hours > 0
    ? new Date(Date.now() + hours * 60 * 60 * 1000).toISOString()
    : null

  const row = {
    id: generateId(),
    eventId: evt.id,
    token: randomBytes(24).toString('base64url'),
    level,
    createdBy: me.id,
    createdAt: now(),
    expiresAt,
  }
  db.insert(eventInvites).values(row).run()
  return row
})
