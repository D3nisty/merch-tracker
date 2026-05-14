import { useDb } from '../../../db'
import { users, persons } from '../../../db/schema'
import { eq } from 'drizzle-orm'
import { requireRole } from '../../../utils/auth'

export default defineEventHandler(async (event) => {
  await requireRole(event, ['admin'])
  const db = useDb()
  return db.select({
    id: users.id,
    username: users.username,
    role: users.role,
    personId: users.personId,
    name: persons.name,
    color: persons.color,
    createdAt: users.createdAt,
  }).from(users)
    .leftJoin(persons, eq(persons.id, users.personId))
    .orderBy(users.createdAt)
    .all()
})
