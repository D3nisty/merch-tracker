import { useDb } from '../../../../db'
import { booths, boothShares, boothGroupShares, events } from '../../../../db/schema'
import { eq } from 'drizzle-orm'
import { requireUser } from '../../../../utils/auth'
import { eventIdForBooth } from '../../../../utils/permissions'

/**
 * Revoke a booth share — either user OR group. The `shareId` may match
 * either `booth_shares.id` or `booth_group_shares.id`; we check both
 * tables and delete from whichever matches. Owner / admin only.
 */
export default defineEventHandler(async (event) => {
  const boothId = getRouterParam(event, 'id')!
  const shareId = getRouterParam(event, 'shareId')!
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

  const userRow = db.select({ id: boothShares.id, boothId: boothShares.boothId })
    .from(boothShares).where(eq(boothShares.id, shareId)).get()
  if (userRow) {
    if (userRow.boothId !== boothId) throw createError({ statusCode: 404, message: 'Share not found' })
    db.delete(boothShares).where(eq(boothShares.id, shareId)).run()
    return { ok: true }
  }

  const groupRow = db.select({ id: boothGroupShares.id, boothId: boothGroupShares.boothId })
    .from(boothGroupShares).where(eq(boothGroupShares.id, shareId)).get()
  if (groupRow) {
    if (groupRow.boothId !== boothId) throw createError({ statusCode: 404, message: 'Share not found' })
    db.delete(boothGroupShares).where(eq(boothGroupShares.id, shareId)).run()
    return { ok: true }
  }

  throw createError({ statusCode: 404, message: 'Share not found' })
})
