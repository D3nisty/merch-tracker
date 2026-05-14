import { useDb } from '../../../db'
import { booths, boothShares, boothGroupShares, users, persons, groups } from '../../../db/schema'
import { eq } from 'drizzle-orm'
import { requireUser } from '../../../utils/auth'
import { eventIdForBooth } from '../../../utils/permissions'

/**
 * List shares attached to a single booth — both per-user and per-group.
 * Visible to any logged-in user (matches the event-shares list visibility).
 * Mutations (POST/DELETE) tighten this to event owner or admin.
 *
 * Returns `{ users, groups }` to mirror the event-shares response shape.
 */
export default defineEventHandler(async (event) => {
  const boothId = getRouterParam(event, 'id')!
  const db = useDb()

  const booth = db.select().from(booths).where(eq(booths.id, boothId)).get()
  if (!booth) throw createError({ statusCode: 404, message: 'Booth not found' })
  await requireUser(event)
  const eventId = await eventIdForBooth(boothId)
  if (!eventId) throw createError({ statusCode: 404, message: 'Booth not found' })

  const userRows = db
    .select({
      id: boothShares.id,
      level: boothShares.level,
      createdAt: boothShares.createdAt,
      userId: users.id,
      username: users.username,
      name: persons.name,
      color: persons.color,
    })
    .from(boothShares)
    .innerJoin(users, eq(boothShares.userId, users.id))
    .leftJoin(persons, eq(users.personId, persons.id))
    .where(eq(boothShares.boothId, boothId))
    .all()

  const groupRows = db
    .select({
      id: boothGroupShares.id,
      level: boothGroupShares.level,
      createdAt: boothGroupShares.createdAt,
      groupId: groups.id,
      groupName: groups.name,
    })
    .from(boothGroupShares)
    .innerJoin(groups, eq(boothGroupShares.groupId, groups.id))
    .where(eq(boothGroupShares.boothId, boothId))
    .all()

  return { users: userRows, groups: groupRows }
})
