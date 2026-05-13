import { useDb } from '../../db'
import { users } from '../../db/schema'
import { eq } from 'drizzle-orm'
import { requireUser, verifyPassword, hashPassword } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const body = await readBody(event)
  const current = String(body?.currentPassword ?? '')
  const next = String(body?.newPassword ?? '')
  if (next.length < 6) {
    throw createError({ statusCode: 400, message: 'New password must be at least 6 characters' })
  }
  if (!verifyPassword(current, user.passwordHash)) {
    throw createError({ statusCode: 401, message: 'Current password is incorrect' })
  }
  const db = useDb()
  await db.update(users).set({ passwordHash: hashPassword(next) }).where(eq(users.id, user.id))
  return { ok: true }
})
