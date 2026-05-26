import { useDb } from '../../../../db'
import { eventPersons, events } from '../../../../db/schema'
import { eq, or, and } from 'drizzle-orm'
import { requireUser } from '../../../../utils/auth'

/**
 * Remove a person from the event's participant list. Owner-or-admin only.
 * Existing marks on products / receipt items from that person are NOT
 * touched — the person just disappears from the chip row and from event
 * settlements unless they happen to be the receipt's payer or someone
 * who already marked items.
 */
export default defineEventHandler(async (event) => {
  const idOrSlug = getRouterParam(event, 'id')!
  const personId = getRouterParam(event, 'personId')!

  const db = useDb()
  const ev = db.select().from(events).where(or(eq(events.id, idOrSlug), eq(events.slug, idOrSlug))).get()
  if (!ev) throw createError({ statusCode: 404, message: 'Event not found' })

  const user = await requireUser(event)
  if (user.role !== 'admin' && ev.ownerId !== user.id) {
    throw createError({ statusCode: 403, message: 'Only the event owner or an admin can manage participants' })
  }

  db.delete(eventPersons)
    .where(and(eq(eventPersons.eventId, ev.id), eq(eventPersons.personId, personId)))
    .run()
  return { success: true }
})
