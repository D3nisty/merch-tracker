import { useDb } from '../../../db'
import { events, locations } from '../../../db/schema'
import { eq, or } from 'drizzle-orm'
import { requireEventEdit } from '../../../utils/permissions'

/**
 * Body: { ids: string[] } — the full ordered list of location IDs belonging
 * to this event. We refuse partial reorders so the resulting order is always
 * a complete permutation of what's on the server (defends against the client
 * sending a stale list after a concurrent add).
 */
export default defineEventHandler(async (event) => {
  const idOrSlug = getRouterParam(event, 'id')!
  const db = useDb()

  const eventRow = db.select({ id: events.id }).from(events)
    .where(or(eq(events.id, idOrSlug), eq(events.slug, idOrSlug))).get()
  if (!eventRow) throw createError({ statusCode: 404, message: 'Event not found' })

  await requireEventEdit(event, eventRow.id)

  const body = await readBody(event)
  const ids: string[] = Array.isArray(body?.ids) ? body.ids.filter((x: unknown): x is string => typeof x === 'string') : []
  if (!ids.length) throw createError({ statusCode: 400, message: 'ids[] is required' })

  // All IDs must belong to this event, and the set must be complete.
  const existing = db.select({ id: locations.id }).from(locations)
    .where(eq(locations.eventId, eventRow.id)).all().map(r => r.id)
  const sentSet = new Set(ids)
  if (existing.length !== ids.length || existing.some(id => !sentSet.has(id))) {
    throw createError({ statusCode: 409, message: 'ids must contain every location of this event exactly once' })
  }

  ids.forEach((id, i) => {
    db.update(locations).set({ sortOrder: i }).where(eq(locations.id, id)).run()
  })

  return { success: true }
})
