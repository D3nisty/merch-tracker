import { useDb } from '../../db'
import { groups, groupMembers } from '../../db/schema'
import { generateId, now } from '../../utils/id'
import { requireUser } from '../../utils/auth'

/**
 * Any logged-in user can create a group. They become the owner and the first
 * member, so they can immediately share events with it.
 */
export default defineEventHandler(async (event) => {
  const me = await requireUser(event)
  const body = await readBody(event)

  const name = String(body?.name ?? '').trim()
  if (!name) throw createError({ statusCode: 400, message: 'name is required' })

  const db = useDb()
  const ts = now()
  const newGroup = { id: generateId(), name, ownerId: me.id, createdAt: ts }
  db.insert(groups).values(newGroup).run()

  // Owner is implicitly a member.
  db.insert(groupMembers).values({ id: generateId(), groupId: newGroup.id, userId: me.id, createdAt: ts }).run()

  return { ...newGroup, memberCount: 1 }
})
