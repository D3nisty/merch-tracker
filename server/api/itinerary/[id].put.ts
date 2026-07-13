import { useDb } from '../../db'
import { itineraryItems } from '../../db/schema'
import { eq } from 'drizzle-orm'
import { requireEventEdit } from '../../utils/permissions'

const KINDS = ['activity', 'ticket', 'food', 'transport', 'shopping', 'note'] as const
type Kind = typeof KINDS[number]

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const db = useDb()
  const existing = db.select().from(itineraryItems).where(eq(itineraryItems.id, id)).get()
  if (!existing) throw createError({ statusCode: 404, message: 'Itinerary item not found' })

  await requireEventEdit(event, existing.eventId)

  const body = await readBody(event) as Record<string, unknown>
  const patch: Record<string, unknown> = {}

  if (typeof body.title === 'string' && body.title.trim()) patch.title = body.title.trim()
  if (typeof body.kind === 'string' && KINDS.includes(body.kind as Kind)) patch.kind = body.kind
  if ('date' in body) patch.date = body.date || null
  if ('time' in body) patch.time = body.time || null
  if ('fromLoc' in body) patch.fromLoc = (body.fromLoc as string)?.trim() || null
  if ('toLoc' in body) patch.toLoc = (body.toLoc as string)?.trim() || null
  if ('endTime' in body) patch.endTime = body.endTime || null
  if ('done' in body) patch.done = !!body.done
  if ('price' in body) patch.price = typeof body.price === 'number' && isFinite(body.price) ? body.price : null
  if (typeof body.currency === 'string') patch.currency = body.currency.toUpperCase()
  if ('url' in body) patch.url = (body.url as string)?.trim() || null
  if ('notes' in body) patch.notes = (body.notes as string)?.trim() || null

  if (Object.keys(patch).length) {
    db.update(itineraryItems).set(patch).where(eq(itineraryItems.id, id)).run()
  }
  return db.select().from(itineraryItems).where(eq(itineraryItems.id, id)).get()
})
