import { useDb } from '../../../../db'
import { booths, boothInvites, events } from '../../../../db/schema'
import { eq } from 'drizzle-orm'
import { requireUser } from '../../../../utils/auth'
import { eventIdForBooth } from '../../../../utils/permissions'

/**
 * Revoke a booth invite token. After this, any in-flight redeem attempts
 * with that token will 404. Existing booth_shares created via the invite
 * are NOT affected — those are revoked separately.
 */
export default defineEventHandler(async (event) => {
  const boothId = getRouterParam(event, 'id')!
  const inviteId = getRouterParam(event, 'inviteId')!
  const db = useDb()
  const booth = db.select().from(booths).where(eq(booths.id, boothId)).get()
  if (!booth) throw createError({ statusCode: 404, message: 'Booth not found' })

  const eventId = await eventIdForBooth(boothId)
  if (!eventId) throw createError({ statusCode: 404, message: 'Booth not found' })

  const me = await requireUser(event)
  const evt = db.select({ ownerId: events.ownerId }).from(events).where(eq(events.id, eventId)).get()
  if (me.role !== 'admin' && evt?.ownerId !== me.id) {
    throw createError({ statusCode: 403, message: 'Only the event owner or an admin can manage booth invites' })
  }

  db.delete(boothInvites).where(eq(boothInvites.id, inviteId)).run()
  return { ok: true }
})
