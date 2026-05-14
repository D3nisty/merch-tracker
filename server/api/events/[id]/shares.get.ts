import { useDb } from '../../../db'
import { events, eventShares, eventGroupShares, users, groups, persons } from '../../../db/schema'
import { eq, or } from 'drizzle-orm'
import { requireEventView } from '../../../utils/permissions'

/**
 * List both user-shares and group-shares for an event. Anyone who can view the
 * event can see who else is shared with.
 */
export default defineEventHandler(async (event) => {
  const idOrSlug = getRouterParam(event, 'id')!
  const db = useDb()
  const evt = db.select().from(events).where(or(eq(events.id, idOrSlug), eq(events.slug, idOrSlug))).get()
  if (!evt) throw createError({ statusCode: 404, message: 'Event not found' })
  await requireEventView(event, evt.id)

  const userShares = db
    .select({
      id: eventShares.id,
      level: eventShares.level,
      createdAt: eventShares.createdAt,
      userId: eventShares.userId,
      username: users.username,
      name: persons.name,
      color: persons.color,
    })
    .from(eventShares)
    .innerJoin(users, eq(eventShares.userId, users.id))
    .leftJoin(persons, eq(persons.id, users.personId))
    .where(eq(eventShares.eventId, evt.id))
    .all()

  const groupShares = db
    .select({
      id: eventGroupShares.id,
      level: eventGroupShares.level,
      createdAt: eventGroupShares.createdAt,
      groupId: eventGroupShares.groupId,
      groupName: groups.name,
    })
    .from(eventGroupShares)
    .innerJoin(groups, eq(eventGroupShares.groupId, groups.id))
    .where(eq(eventGroupShares.eventId, evt.id))
    .all()

  return { users: userShares, groups: groupShares }
})
