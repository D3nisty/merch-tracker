import { useDb } from '../../db'
import { locations } from '../../db/schema'
import { generateId, now } from '../../utils/id'
import { requireRole } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  await requireRole(event, ['admin', 'editor'])
  const body = await readBody(event)

  if (!body.eventId || !body.name || !body.type) {
    throw createError({ statusCode: 400, message: 'eventId, name and type are required' })
  }

  const db = useDb()
  const id = generateId()

  const newLocation = {
    id,
    eventId: body.eventId,
    name: body.name,
    type: body.type as 'hall' | 'city' | 'country' | 'area' | 'district',
    floorPlanImage: body.floorPlanImage ?? null,
    notes: body.notes ?? null,
    dateFrom: body.dateFrom ?? null,
    dateTo: body.dateTo ?? null,
    createdAt: now(),
  }

  db.insert(locations).values(newLocation).run()

  return newLocation
})
