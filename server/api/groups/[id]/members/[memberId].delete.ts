import { useDb } from '../../../../db'
import { groups, groupMembers } from '../../../../db/schema'
import { eq } from 'drizzle-orm'
import { requireUser } from '../../../../utils/auth'

/**
 * Remove a user from a group. Group owner or admin only. A user can also
 * remove themselves (leave the group).
 */
export default defineEventHandler(async (event) => {
  const me = await requireUser(event)
  const id = getRouterParam(event, 'id')!
  const memberId = getRouterParam(event, 'memberId')!
  const db = useDb()

  const group = db.select().from(groups).where(eq(groups.id, id)).get()
  if (!group) throw createError({ statusCode: 404, message: 'Group not found' })

  const member = db.select().from(groupMembers).where(eq(groupMembers.id, memberId)).get()
  if (!member || member.groupId !== id) throw createError({ statusCode: 404, message: 'Member not found' })

  const isOwnerOrAdmin = me.role === 'admin' || group.ownerId === me.id
  const isSelf = member.userId === me.id
  if (!isOwnerOrAdmin && !isSelf) {
    throw createError({ statusCode: 403, message: 'Forbidden' })
  }

  db.delete(groupMembers).where(eq(groupMembers.id, memberId)).run()
  return { success: true }
})
