import { useDb } from '../../db'
import { locations } from '../../db/schema'
import { generateId, now } from '../../utils/id'
import { requireEventEdit } from '../../utils/permissions'
import { eq, sql } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  if (body.eventId) await requireEventEdit(event, body.eventId)

  if (!body.eventId || !body.name || !body.type) {
    throw createError({ statusCode: 400, message: 'eventId, name and type are required' })
  }

  const db = useDb()
  const id = generateId()

  // Append to the end of the event's location list.
  const maxRow = db.select({ m: sql<number>`COALESCE(MAX(${locations.sortOrder}), -1)` })
    .from(locations).where(eq(locations.eventId, body.eventId)).get()
  const sortOrder = (maxRow?.m ?? -1) + 1

  const newLocation = {
    id,
    eventId: body.eventId,
    name: body.name,
    type: body.type as 'hall' | 'city' | 'country' | 'area' | 'district',
    floorPlanImage: body.floorPlanImage ?? null,
    notes: body.notes ?? null,
    dateFrom: body.dateFrom ?? null,
    dateTo: body.dateTo ?? null,
    sortOrder,
    createdAt: now(),
  }

  db.insert(locations).values(newLocation).run()

  return newLocation
})
