import { useDb } from '../../db'
import { booths } from '../../db/schema'
import { generateId, now } from '../../utils/id'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  if (!body.locationId || !body.name) {
    throw createError({ statusCode: 400, message: 'locationId and name are required' })
  }

  const db = useDb()
  const id = generateId()

  const newBooth = {
    id,
    locationId: body.locationId,
    name: body.name,
    boothNr: body.boothNr ?? null,
    hallNr: body.hallNr ?? null,
    mapX: body.mapX ?? null,
    mapY: body.mapY ?? null,
    mapW: body.mapW ?? null,
    mapH: body.mapH ?? null,
    website: body.website ?? null,
    notes: body.notes ?? null,
    shopCategory: body.shopCategory ?? null,
    personId: body.personId ?? null,
    createdAt: now(),
  }

  db.insert(booths).values(newBooth).run()

  return newBooth
})
