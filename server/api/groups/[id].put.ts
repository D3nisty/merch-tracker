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
    throw createError({ statusCode: 403, message: 'Only the group owner or an admin can edit a group' })
  }

  const body = await readBody(event)
  const name = body?.name !== undefined ? String(body.name).trim() : existing.name
  if (!name) throw createError({ statusCode: 400, message: 'name cannot be empty' })

  db.update(groups).set({ name }).where(eq(groups.id, id)).run()
  return { ...existing, name }
})
