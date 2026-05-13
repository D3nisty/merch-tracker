import { useDb } from '../../../db'
import { groups, groupMembers, users } from '../../../db/schema'
import { eq, and } from 'drizzle-orm'
import { generateId, now } from '../../../utils/id'
import { requireUser } from '../../../utils/auth'

/**
 * Add a user to a group. Only the group owner or an admin can do this.
 *
 * Body: { userId: string }
 *
 * Idempotent: returns the existing membership row if the user is already in.
 */
export default defineEventHandler(async (event) => {
  const me = await requireUser(event)
  const id = getRouterParam(event, 'id')!
  const body = await readBody(event)
  const userId = String(body?.userId ?? '')
  if (!userId) throw createError({ statusCode: 400, message: 'userId is required' })

  const db = useDb()
  const group = db.select().from(groups).where(eq(groups.id, id)).get()
  if (!group) throw createError({ statusCode: 404, message: 'Group not found' })
  if (me.role !== 'admin' && group.ownerId !== me.id) {
    throw createError({ statusCode: 403, message: 'Only the group owner or an admin can add members' })
  }

  const targetUser = db.select({ id: users.id }).from(users).where(eq(users.id, userId)).get()
  if (!targetUser) throw createError({ statusCode: 404, message: 'User not found' })

  const existing = db.select().from(groupMembers)
    .where(and(eq(groupMembers.groupId, id), eq(groupMembers.userId, userId))).get()
  if (existing) return existing

  const row = { id: generateId(), groupId: id, userId, createdAt: now() }
  db.insert(groupMembers).values(row).run()
  return row
})
