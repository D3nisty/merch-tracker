import { useDb } from '../../../db'
import { users } from '../../../db/schema'
import { eq } from 'drizzle-orm'
import { requireRole } from '../../../utils/auth'

export default defineEventHandler(async (event) => {
  const me = await requireRole(event, ['admin'])
  const id = getRouterParam(event, 'id')!
  const db = useDb()

  const target = db.select().from(users).where(eq(users.id, id)).get()
  if (!target) throw createError({ statusCode: 404, message: 'User not found' })

  if (target.id === me.id) {
    throw createError({ statusCode: 400, message: 'You cannot delete your own account here' })
  }
  if (target.role === 'admin') {
    const adminCount = (db.select().from(users).where(eq(users.role, 'admin')).all()).length
    if (adminCount <= 1) {
      throw createError({ statusCode: 400, message: 'Cannot delete the last admin' })
    }
  }

  db.delete(users).where(eq(users.id, id)).run()
  return { success: true }
})
