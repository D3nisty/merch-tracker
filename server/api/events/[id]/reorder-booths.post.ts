import { useDb } from '../../../db'
import { events, locations, booths } from '../../../db/schema'
import { eq, or, inArray } from 'drizzle-orm'
import { requireEventEdit } from '../../../utils/permissions'

/**
 * Body: { groups: [{ locationId, boothIds: string[] }, ...] }
 *
 * Rewrites the booth list across every location of this event in one shot.
 * The client sends the FULL new arrangement after each drag — this lets a
 * cross-list move (e.g. "TacToki was in Hall 10 → put it in Hall 1") and a
 * within-list reorder share the same code path, and avoids stale-list
 * races where two concurrent drags would partially overwrite each other.
 *
 * The union of `boothIds` across `groups` must equal the set of booths
 * already attached to this event — no booths created or deleted here.
 */
export default defineEventHandler(async (event) => {
  const idOrSlug = getRouterParam(event, 'id')!
  const db = useDb()

  const eventRow = db.select({ id: events.id }).from(events)
    .where(or(eq(events.id, idOrSlug), eq(events.slug, idOrSlug))).get()
  if (!eventRow) throw createError({ statusCode: 404, message: 'Event not found' })

  await requireEventEdit(event, eventRow.id)

  const body = await readBody(event)
  const rawGroups = Array.isArray(body?.groups) ? body.groups : []
  const groups: Array<{ locationId: string; boothIds: string[] }> = []
  for (const g of rawGroups) {
    if (typeof g?.locationId !== 'string' || !Array.isArray(g?.boothIds)) continue
    groups.push({
      locationId: g.locationId,
      boothIds: g.boothIds.filter((x: unknown): x is string => typeof x === 'string'),
    })
  }
  if (!groups.length) throw createError({ statusCode: 400, message: 'groups[] is required' })

  // Every locationId must belong to this event.
  const eventLocationIds = new Set(
    db.select({ id: locations.id }).from(locations)
      .where(eq(locations.eventId, eventRow.id)).all().map(r => r.id)
  )
  for (const g of groups) {
    if (!eventLocationIds.has(g.locationId)) {
      throw createError({ statusCode: 409, message: `locationId ${g.locationId} does not belong to this event` })
    }
  }

  // Union of incoming booth IDs must equal the set of booths attached to
  // the event right now. Reject partial arrangements outright.
  const allSent = groups.flatMap(g => g.boothIds)
  const sentSet = new Set(allSent)
  if (allSent.length !== sentSet.size) {
    throw createError({ statusCode: 400, message: 'duplicate boothId in payload' })
  }
  const existing = allSent.length
    ? db.select({ id: booths.id }).from(booths)
        .where(inArray(booths.locationId, [...eventLocationIds])).all().map(r => r.id)
    : []
  if (existing.length !== sentSet.size || existing.some(id => !sentSet.has(id))) {
    throw createError({ statusCode: 409, message: 'groups must contain every booth of this event exactly once' })
  }

  // Apply: a single UPDATE per booth setting both location_id (in case it
  // moved) and the new sort_order.
  for (const g of groups) {
    g.boothIds.forEach((boothId, i) => {
      db.update(booths)
        .set({ locationId: g.locationId, sortOrder: i })
        .where(eq(booths.id, boothId))
        .run()
    })
  }

  return { success: true }
})
