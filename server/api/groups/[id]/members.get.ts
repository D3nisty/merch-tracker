import { useDb } from '../../../db'
import { groups, groupMembers, users } from '../../../db/schema'
import { eq } from 'drizzle-orm'
import { requireUser } from '../../../utils/auth'

/**
 * List members of a group. Visible to admin, group owner, and any current
 * member of the group.
 */
export default defineEventHandler(async (event) => {
  const me = await requireUser(event)
  const id = getRouterParam(event, 'id')!
  const db = useDb()

  const group = db.select().from(groups).where(eq(groups.id, id)).get()
  if (!group) throw createError({ statusCode: 404, message: 'Group not found' })

  if (me.role !== 'admin' && group.ownerId !== me.id) {
    const amMember = db.select().from(groupMembers)
      .where(eq(groupMembers.groupId, id)).all()
      .some(m => m.userId === me.id)
    if (!amMember) throw createError({ statusCode: 403, message: 'Forbidden' })
  }

  return db.select({
    id: groupMembers.id,
    userId: groupMembers.userId,
    username: users.username,
    role: users.role,
    createdAt: groupMembers.createdAt,
  })
    .from(groupMembers)
    .innerJoin(users, eq(groupMembers.userId, users.id))
    .where(eq(groupMembers.groupId, id))
    .orderBy(users.username)
    .all()
})
