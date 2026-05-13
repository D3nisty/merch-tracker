import { useDb } from '../../../db'
import { users } from '../../../db/schema'
import { eq } from 'drizzle-orm'
import { requireRole, hashPassword } from '../../../utils/auth'

const ROLES = ['admin', 'editor', 'user'] as const

/**
 * Update a user's role and/or password. Admin-only.
 *
 * Body: { role?: 'admin'|'editor'|'user', password?: string }
 *
 * Safety rail: an admin can't demote themselves to a non-admin role if they're
 * the only remaining admin — the system always needs at least one.
 */
export default defineEventHandler(async (event) => {
  const me = await requireRole(event, ['admin'])
  const id = getRouterParam(event, 'id')!
  const db = useDb()

  const target = db.select().from(users).where(eq(users.id, id)).get()
  if (!target) throw createError({ statusCode: 404, message: 'User not found' })

  const body = await readBody(event)
  const update: { role?: 'admin'|'editor'|'user'; passwordHash?: string } = {}

  if (body?.role !== undefined) {
    if (!ROLES.includes(body.role)) {
      throw createError({ statusCode: 400, message: 'Invalid role' })
    }
    if (target.role === 'admin' && body.role !== 'admin') {
      const adminCount = (db.select().from(users).where(eq(users.role, 'admin')).all()).length
      if (adminCount <= 1) {
        throw createError({ statusCode: 400, message: 'Cannot demote the last admin' })
      }
      if (target.id === me.id) {
        throw createError({ statusCode: 400, message: 'You cannot demote yourself; ask another admin to do it' })
      }
    }
    update.role = body.role
  }

  if (typeof body?.password === 'string' && body.password.length > 0) {
    if (body.password.length < 6) {
      throw createError({ statusCode: 400, message: 'password must be at least 6 characters' })
    }
    update.passwordHash = hashPassword(body.password)
  }

  if (Object.keys(update).length === 0) {
    throw createError({ statusCode: 400, message: 'Nothing to update' })
  }

  db.update(users).set(update).where(eq(users.id, id)).run()
  return { id: target.id, username: target.username, role: update.role ?? target.role }
})
