import { useDb } from '../../../db'
import { booths, boothInvites, events } from '../../../db/schema'
import { eq } from 'drizzle-orm'
import { requireUser } from '../../../utils/auth'
import { eventIdForBooth } from '../../../utils/permissions'

/**
 * List active invite tokens for a booth. Owner / admin only — invite tokens
 * are credentials and shouldn't leak even to booth-share-edit collaborators.
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
    throw createError({ statusCode: 403, message: 'Only the event owner or an admin can manage booth invites' })
  }

  return db.select().from(boothInvites).where(eq(boothInvites.boothId, boothId)).all()
})
