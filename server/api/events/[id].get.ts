import { useDb } from '../../db'
import { events, locations, booths, products, catalogImages } from '../../db/schema'
import { eq, or } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const db = useDb()

  const eventRow = db.select().from(events).where(or(eq(events.id, id), eq(events.slug, id))).get()
  if (!eventRow) throw createError({ statusCode: 404, message: 'Event not found' })

  const locationRows = db.select().from(locations).where(eq(locations.eventId, eventRow.id)).all()

  const locationIds = locationRows.map(l => l.id)
  const boothRows = locationIds.length
    ? db.select().from(booths).all().filter(b => locationIds.includes(b.locationId))
    : []

  const boothIds = boothRows.map(b => b.id)

  const productRows = boothIds.length
    ? db.select().from(products).all().filter(p => boothIds.includes(p.boothId))
    : []

  const imageRows = boothIds.length
    ? db.select().from(catalogImages).all().filter(i => boothIds.includes(i.boothId))
    : []

  // Assemble nested structure
  const locationsWithBooths = locationRows.map(loc => ({
    ...loc,
    booths: boothRows
      .filter(b => b.locationId === loc.id)
      .map(booth => ({
        ...booth,
        products: productRows.filter(p => p.boothId === booth.id),
        images: imageRows.filter(i => i.boothId === booth.id),
      })),
  }))

  return {
    ...eventRow,
    locations: locationsWithBooths,
  }
})
