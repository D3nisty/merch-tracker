import { useDb } from '../../db'
import { booths, locations } from '../../db/schema'
import { generateId, now, toSlug } from '../../utils/id'
import { eq, sql } from 'drizzle-orm'
import { requireEventEdit, eventIdForLocation } from '../../utils/permissions'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  if (!body.locationId || !body.name) {
    throw createError({ statusCode: 400, message: 'locationId and name are required' })
  }

  const eventId = await eventIdForLocation(body.locationId)
  if (!eventId) throw createError({ statusCode: 404, message: 'Location not found' })
  await requireEventEdit(event, eventId)

  const db = useDb()
  const id = generateId()

  // Generate slug unique within the event (eventId already resolved above)
  const existingSlugs = db.select({ slug: booths.slug }).from(booths)
    .innerJoin(locations, eq(booths.locationId, locations.id))
    .where(eq(locations.eventId, eventId)).all()
    .map(r => r.slug ?? '')

  const base = toSlug(body.name)
  let slug = base
  let i = 2
  while (existingSlugs.includes(slug)) slug = `${base}-${i++}`

  // Append to the end of the location's booth list. MAX returns null on an
  // empty list so coalesce to -1 → first row gets sortOrder 0.
  const maxRow = db.select({ m: sql<number>`COALESCE(MAX(${booths.sortOrder}), -1)` })
    .from(booths).where(eq(booths.locationId, body.locationId)).get()
  const sortOrder = (maxRow?.m ?? -1) + 1

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
    sortOrder,
    createdAt: now(),
  }

  db.insert(booths).values(newBooth).run()

  return newBooth
})
