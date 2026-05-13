import { useDb } from '../../db'
import { users } from '../../db/schema'
import { eq } from 'drizzle-orm'
import { verifyPassword, createSession, setSessionCookie } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const username = String(body?.username ?? '').trim().toLowerCase()
  const password = String(body?.password ?? '')
  if (!username || !password) {
    throw createError({ statusCode: 400, message: 'username and password are required' })
  }

  const db = useDb()
  const user = await db.select().from(users).where(eq(users.username, username)).get()
  if (!user || !verifyPassword(password, user.passwordHash)) {
    throw createError({ statusCode: 401, message: 'Invalid credentials' })
  }

  const session = await createSession(user.id)
  setSessionCookie(event, session.id, session.expiresAt)

  return { id: user.id, username: user.username, role: user.role }
})
