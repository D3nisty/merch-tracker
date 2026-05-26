import { useDb } from '../../../db'
import { eventPersons, persons, events } from '../../../db/schema'
import { eq, or, asc } from 'drizzle-orm'
import { requireEventView } from '../../../utils/permissions'

/**
 * List the persons explicitly assigned as participants of this event.
 * Public to any viewer with event-view access — the receipt UI uses this
 * list to scope its "who claimed what" chip rendering to people actually
 * on the trip, not every Person in the system.
 */
export default defineEventHandler(async (event) => {
  const idOrSlug = getRouterParam(event, 'id')!
  const db = useDb()
  const ev = db.select().from(events).where(or(eq(events.id, idOrSlug), eq(events.slug, idOrSlug))).get()
  if (!ev) throw createError({ statusCode: 404, message: 'Event not found' })
  await requireEventView(event, ev.id)

  return db.select({
    id: persons.id,
    name: persons.name,
    color: persons.color,
    createdAt: persons.createdAt,
  })
    .from(eventPersons)
    .innerJoin(persons, eq(persons.id, eventPersons.personId))
    .where(eq(eventPersons.eventId, ev.id))
    .orderBy(asc(persons.name))
    .all()
})
