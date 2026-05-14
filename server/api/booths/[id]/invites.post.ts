import { randomBytes } from 'node:crypto'
import { useDb } from '../../../db'
import { booths, boothInvites, events } from '../../../db/schema'
import { eq } from 'drizzle-orm'
import { generateId, now } from '../../../utils/id'
import { requireUser } from '../../../utils/auth'
import { eventIdForBooth } from '../../../utils/permissions'

/**
 * Mint a magic-link invite token for booth-level access. Owner / admin only.
 *
 * Body: { level?: 'view' | 'edit' (default 'edit'), expiresInHours?: number }
 *
 * Same multi-use semantics as event invites — anyone with the link can
 * redeem until the token is revoked or expires.
 */
export default defineEventHandler(async (event) => {
  const boothId = getRouterParam(event, 'id')!
  const db = useDb()
  const booth = db.select().from(booths).where(eq(booths.id, boothId)).get()
  if (!booth) throw createError({ statusCode: 404, message: 'Booth not found' })

  const eventId = await eventIdForBooth(boothId)
  if (!eventId) throw createError({ statusCode: 404, message: 'Booth not found' })

  const me = await requireUser(event)
  const evt = db.select({ ownerId: events.ownerId }).from(events).where(eq(events.id, eventId)).get()
  if (me.role !== 'admin' && evt?.ownerId !== me.id) {
    throw createError({ statusCode: 403, message: 'Only the event owner or an admin can mint booth invites' })
  }

  const body = await readBody(event) as { level?: 'view' | 'edit'; expiresInHours?: number }
  const level: 'view' | 'edit' = body.level === 'view' ? 'view' : 'edit'
  const hours = Number(body.expiresInHours)
  const expiresAt = Number.isFinite(hours) && hours > 0
    ? new Date(Date.now() + hours * 60 * 60 * 1000).toISOString()
    : null

  const row = {
    id: generateId(),
    boothId,
    token: randomBytes(24).toString('base64url'),
    level,
    createdBy: me.id,
    createdAt: now(),
    expiresAt,
  }
  db.insert(boothInvites).values(row).run()
  return row
})
