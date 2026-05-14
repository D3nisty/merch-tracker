import { useDb } from '../../../db'
import { booths, boothShares, boothGroupShares, events, users, groups } from '../../../db/schema'
import { eq, and } from 'drizzle-orm'
import { generateId, now } from '../../../utils/id'
import { requireUser } from '../../../utils/auth'
import { eventIdForBooth } from '../../../utils/permissions'

/**
 * Share a booth with a user OR a group. Only the event owner or an admin
 * can grant booth shares — collaborators with booth-edit themselves cannot
 * re-share the booth onward. Upserts on (boothId, userId) or
 * (boothId, groupId) so calling twice with a different level just updates
 * the existing row.
 *
 * Body: { userId?: string, groupId?: string, level?: 'view' | 'edit' (default 'edit') }
 */
export default defineEventHandler(async (event) => {
  const boothId = getRouterParam(event, 'id')!
  const db = useDb()

  const booth = db.select().from(booths).where(eq(booths.id, boothId)).get()
  if (!booth) throw createError({ statusCode: 404, message: 'Booth not found' })

  const eventId = await eventIdForBooth(boothId)
  if (!eventId) throw createError({ statusCode: 404, message: 'Booth not found' })

  const me = await requireUser(event)
  const evt = db.select({ ownerId: events.ownerId }).from(events).where(eq(events.id, eventId)).get()
  if (me.role !== 'admin' && evt?.ownerId !== me.id) {
    throw createError({ statusCode: 403, message: 'Only the event owner or an admin can manage booth shares' })
  }

  const body = await readBody(event) as { userId?: string; groupId?: string; level?: 'view' | 'edit' }
  const level = body.level === 'view' ? 'view' : 'edit'
  const ts = now()

  if (body.userId) {
    const target = db.select({ id: users.id }).from(users).where(eq(users.id, body.userId)).get()
    if (!target) throw createError({ statusCode: 404, message: 'User not found' })
    if (target.id === evt?.ownerId) {
      throw createError({ statusCode: 400, message: 'Event owner already has edit access — share is redundant' })
    }

    const existing = db.select().from(boothShares)
      .where(and(eq(boothShares.boothId, boothId), eq(boothShares.userId, target.id)))
      .get()
    if (existing) {
      db.update(boothShares).set({ level }).where(eq(boothShares.id, existing.id)).run()
      return { ...existing, level }
    }
    const row = { id: generateId(), boothId, userId: target.id, level, createdAt: ts }
    db.insert(boothShares).values(row).run()
    return row
  }

  if (body.groupId) {
    const target = db.select({ id: groups.id }).from(groups).where(eq(groups.id, body.groupId)).get()
    if (!target) throw createError({ statusCode: 404, message: 'Group not found' })

    const existing = db.select().from(boothGroupShares)
      .where(and(eq(boothGroupShares.boothId, boothId), eq(boothGroupShares.groupId, target.id)))
      .get()
    if (existing) {
      db.update(boothGroupShares).set({ level }).where(eq(boothGroupShares.id, existing.id)).run()
      return { ...existing, level }
    }
    const row = { id: generateId(), boothId, groupId: target.id, level, createdAt: ts }
    db.insert(boothGroupShares).values(row).run()
    return row
  }

  throw createError({ statusCode: 400, message: 'Either userId or groupId is required' })
})
