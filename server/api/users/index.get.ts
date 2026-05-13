import { useDb } from '../../db'
import { users } from '../../db/schema'
import { requireUser } from '../../utils/auth'

/**
 * Minimal user list for the share picker UI. Any logged-in user can see the
 * list of usernames + IDs (no password hashes, no other sensitive data).
 */
export default defineEventHandler(async (event) => {
  await requireUser(event)
  const db = useDb()
  return db.select({ id: users.id, username: users.username, role: users.role }).from(users).orderBy(users.username).all()
})
