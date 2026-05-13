import { useDb } from '../../../db'
import { users } from '../../../db/schema'
import { eq } from 'drizzle-orm'
import { generateId, now } from '../../../utils/id'
import { requireRole, hashPassword } from '../../../utils/auth'

const ROLES = ['admin', 'editor', 'user'] as const

export default defineEventHandler(async (event) => {
  await requireRole(event, ['admin'])
  const body = await readBody(event)

  const username = String(body?.username ?? '').trim().toLowerCase()
  const password = String(body?.password ?? '')
  const role = ROLES.includes(body?.role) ? body.role : 'user'

  if (!username || username.length < 2) {
    throw createError({ statusCode: 400, message: 'username must be at least 2 characters' })
  }
  if (password.length < 6) {
    throw createError({ statusCode: 400, message: 'password must be at least 6 characters' })
  }

  const db = useDb()
  const existing = db.select({ id: users.id }).from(users).where(eq(users.username, username)).get()
  if (existing) throw createError({ statusCode: 409, message: 'Username already taken' })

  const newUser = {
    id: generateId(),
    username,
    passwordHash: hashPassword(password),
    role,
    createdAt: now(),
  }
  db.insert(users).values(newUser).run()
  return { id: newUser.id, username: newUser.username, role: newUser.role, createdAt: newUser.createdAt }
})
