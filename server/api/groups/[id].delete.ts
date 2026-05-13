import { useDb } from '../../db'
import { groups } from '../../db/schema'
import { eq } from 'drizzle-orm'
import { requireUser } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  const me = await requireUser(event)
  const id = getRouterParam(event, 'id')!
  const db = useDb()

  const existing = db.select().from(groups).where(eq(groups.id, id)).get()
  if (!existing) throw createError({ statusCode: 404, message: 'Group not found' })

  if (me.role !== 'admin' && existing.ownerId !== me.id) {
    throw createError({ statusCode: 403, message: 'Only the group owner or an admin can delete a group' })
  }

  db.delete(groups).where(eq(groups.id, id)).run()
  return { success: true }
})
