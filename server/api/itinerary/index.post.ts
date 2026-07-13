import { useDb } from '../../db'
import { itineraryItems } from '../../db/schema'
import { eq, max } from 'drizzle-orm'
import { generateId, now } from '../../utils/id'
import { requireEventEdit, eventIdForLocation } from '../../utils/permissions'

const KINDS = ['activity', 'ticket', 'food', 'transport', 'shopping', 'note'] as const
type Kind = typeof KINDS[number]

export default defineEventHandler(async (event) => {
  const body = await readBody(event) as {
    locationId?: string
    kind?: string
    title?: string
    date?: string | null
    time?: string | null
    fromLoc?: string | null
    toLoc?: string | null
    endTime?: string | null
    price?: number | null
    currency?: string
    url?: string | null
    notes?: string | null
  }

  if (!body.locationId || !body.title?.trim()) {
    throw createError({ statusCode: 400, message: 'locationId and title are required' })
  }

  const eventId = await eventIdForLocation(body.locationId)
  if (!eventId) throw createError({ statusCode: 404, message: 'Location not found' })
  await requireEventEdit(event, eventId)

  const db = useDb()
  const maxRow = db.select({ m: max(itineraryItems.sortOrder) })
    .from(itineraryItems).where(eq(itineraryItems.locationId, body.locationId)).get()
  const sortOrder = (maxRow?.m ?? -10) + 10

  const kind: Kind = KINDS.includes(body.kind as Kind) ? body.kind as Kind : 'activity'

  const row = {
    id: generateId(),
    eventId,
    locationId: body.locationId,
    kind,
    title: body.title.trim(),
    date: body.date || null,
    time: body.time || null,
    fromLoc: body.fromLoc?.trim() || null,
    toLoc: body.toLoc?.trim() || null,
    endTime: body.endTime || null,
    done: false,
    price: typeof body.price === 'number' && isFinite(body.price) ? body.price : null,
    currency: (body.currency || 'EUR').toUpperCase(),
    url: body.url?.trim() || null,
    attachmentPath: null,
    attachmentName: null,
    notes: body.notes?.trim() || null,
    sortOrder,
    createdAt: now(),
  }
  db.insert(itineraryItems).values(row).run()
  return row
})
