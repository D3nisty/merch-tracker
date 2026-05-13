import { useDb } from '../../../db'
import { events, eventShares, eventGroupShares, users, groups } from '../../../db/schema'
import { eq, or, and } from 'drizzle-orm'
import { generateId, now } from '../../../utils/id'
import { requireUser } from '../../../utils/auth'

/**
 * Share an event with a user OR a group. Only the event owner or an admin
 * can add new shares (edit-shared collaborators cannot grant access to others).
 *
 * Body: { userId?: string, groupId?: string, level: 'view' | 'edit' }
 *
 * Upserts: if a share already exists for the same target, its level is updated.
 */
export default defineEventHandler(async (event) => {
  const idOrSlug = getRouterParam(event, 'id')!
  const db = useDb()
  const evt = db.select().from(events).where(or(eq(events.id, idOrSlug), eq(events.slug, idOrSlug))).get()
  if (!evt) throw createError({ statusCode: 404, message: 'Event not found' })

  const me = await requireUser(event)
  if (me.role !== 'admin' && evt.ownerId !== me.id) {
    throw createError({ statusCode: 403, message: 'Only the event owner or an admin can manage shares' })
  }

  const body = await readBody(event)
  const level = body?.level === 'edit' ? 'edit' : 'view'
  const ts = now()

  if (body?.userId) {
    // Validate the target user exists
    const target = db.select({ id: users.id }).from(users).where(eq(users.id, String(body.userId))).get()
    if (!target) throw createError({ statusCode: 404, message: 'User not found' })

    const existing = db.select().from(eventShares)
      .where(and(eq(eventShares.eventId, evt.id), eq(eventShares.userId, target.id))).get()
    if (existing) {
      db.update(eventShares).set({ level }).where(eq(eventShares.id, existing.id)).run()
      return { ...existing, level }
    }
    const row = { id: generateId(), eventId: evt.id, userId: target.id, level, createdAt: ts }
    db.insert(eventShares).values(row).run()
    return row
  }

  if (body?.groupId) {
    const target = db.select({ id: groups.id }).from(groups).where(eq(groups.id, String(body.groupId))).get()
    if (!target) throw createError({ statusCode: 404, message: 'Group not found' })

    const existing = db.select().from(eventGroupShares)
      .where(and(eq(eventGroupShares.eventId, evt.id), eq(eventGroupShares.groupId, target.id))).get()
    if (existing) {
      db.update(eventGroupShares).set({ level }).where(eq(eventGroupShares.id, existing.id)).run()
      return { ...existing, level }
    }
    const row = { id: generateId(), eventId: evt.id, groupId: target.id, level, createdAt: ts }
    db.insert(eventGroupShares).values(row).run()
    return row
  }

  throw createError({ statusCode: 400, message: 'Either userId or groupId is required' })
})
