import { useDb } from '../../../db'
import { users } from '../../../db/schema'
import { requireRole } from '../../../utils/auth'

export default defineEventHandler(async (event) => {
  await requireRole(event, ['admin'])
  const db = useDb()
  return db.select({
    id: users.id,
    username: users.username,
    role: users.role,
    createdAt: users.createdAt,
  }).from(users).orderBy(users.createdAt).all()
})
