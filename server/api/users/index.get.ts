import { useDb } from '../../db'
import { users, persons } from '../../db/schema'
import { eq } from 'drizzle-orm'
import { requireUser } from '../../utils/auth'

/**
 * Minimal user list for the share picker UI. Any logged-in user can see the
 * list of usernames + display names + colors (no password hashes, no other
 * sensitive data).
 */
export default defineEventHandler(async (event) => {
  await requireUser(event)
  const db = useDb()
  return db.select({
    id: users.id,
    username: users.username,
    role: users.role,
    name: persons.name,
    color: persons.color,
  }).from(users)
    .leftJoin(persons, eq(persons.id, users.personId))
    .orderBy(users.username)
    .all()
})
