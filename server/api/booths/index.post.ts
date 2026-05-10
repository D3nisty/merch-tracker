import { useDb } from '../../db'
import { booths, locations } from '../../db/schema'
import { generateId, now, toSlug } from '../../utils/id'
import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  if (!body.locationId || !body.name) {
    throw createError({ statusCode: 400, message: 'locationId and name are required' })
  }

  const db = useDb()
  const id = generateId()

  // Generate slug unique within the event
  const location = db.select({ eventId: locations.eventId }).from(locations).where(eq(locations.id, body.locationId)).get()
  const eventId = location?.eventId ?? ''
  const existingSlugs = eventId
    ? db.select({ slug: booths.slug }).from(booths)
        .innerJoin(locations, eq(booths.locationId, locations.id))
        .where(eq(locations.eventId, eventId)).all()
        .map(r => r.slug ?? '')
    : []

  const base = toSlug(body.name)
  let slug = base
  let i = 2
  while (existingSlugs.includes(slug)) slug = `${base}-${i++}`

  const newBooth = {
    id,
    slug,
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
