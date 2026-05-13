import { useDb } from '../../db'
import { groups, groupMembers } from '../../db/schema'
import { eq } from 'drizzle-orm'
import { requireUser } from '../../utils/auth'

/**
 * List groups visible to the caller:
 *   - admin sees all groups
 *   - other users see groups they own or are a member of
 *
 * Each row carries a `memberCount` for display.
 */
export default defineEventHandler(async (event) => {
  const me = await requireUser(event)
  const db = useDb()

  const allGroups = db.select().from(groups).orderBy(groups.name).all()

  let visible = allGroups
  if (me.role !== 'admin') {
    const myGroupIds = new Set(db.select({ groupId: groupMembers.groupId }).from(groupMembers).where(eq(groupMembers.userId, me.id)).all().map(r => r.groupId))
    visible = allGroups.filter(g => g.ownerId === me.id || myGroupIds.has(g.id))
  }

  return visible.map(g => ({
    ...g,
    memberCount: db.select().from(groupMembers).where(eq(groupMembers.groupId, g.id)).all().length,
  }))
})
