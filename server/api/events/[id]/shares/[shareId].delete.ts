import { useDb } from '../../../../db'
import { events, eventShares, eventGroupShares } from '../../../../db/schema'
import { eq, or } from 'drizzle-orm'
import { requireUser } from '../../../../utils/auth'

/**
 * Remove a user-share OR group-share from an event. The `shareId` may match
 * either an `event_shares.id` or `event_group_shares.id`. Only the event
 * owner or an admin can revoke shares.
 */
export default defineEventHandler(async (event) => {
  const idOrSlug = getRouterParam(event, 'id')!
  const shareId = getRouterParam(event, 'shareId')!
  const db = useDb()

  const evt = db.select().from(events).where(or(eq(events.id, idOrSlug), eq(events.slug, idOrSlug))).get()
  if (!evt) throw createError({ statusCode: 404, message: 'Event not found' })

  const me = await requireUser(event)
  if (me.role !== 'admin' && evt.ownerId !== me.id) {
    throw createError({ statusCode: 403, message: 'Only the event owner or an admin can manage shares' })
  }

  const userRow = db.select({ id: eventShares.id, eventId: eventShares.eventId }).from(eventShares).where(eq(eventShares.id, shareId)).get()
  if (userRow) {
    if (userRow.eventId !== evt.id) throw createError({ statusCode: 404, message: 'Share not found' })
    db.delete(eventShares).where(eq(eventShares.id, shareId)).run()
    return { success: true }
  }

  const groupRow = db.select({ id: eventGroupShares.id, eventId: eventGroupShares.eventId }).from(eventGroupShares).where(eq(eventGroupShares.id, shareId)).get()
  if (groupRow) {
    if (groupRow.eventId !== evt.id) throw createError({ statusCode: 404, message: 'Share not found' })
    db.delete(eventGroupShares).where(eq(eventGroupShares.id, shareId)).run()
    return { success: true }
  }

  throw createError({ statusCode: 404, message: 'Share not found' })
})
