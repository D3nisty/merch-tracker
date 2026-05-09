import { useDb } from '../../db'
import { locations } from '../../db/schema'
import { generateId, now } from '../../utils/id'

export default defineEventHandler(async (event) => {
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
    createdAt: now(),
  }

  db.insert(locations).values(newLocation).run()

  return newLocation
})
