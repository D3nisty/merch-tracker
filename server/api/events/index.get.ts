import { useDb } from '../../db'
import { events, locations, booths, products } from '../../db/schema'
import { eq } from 'drizzle-orm'

export default defineEventHandler(async () => {
  const db = useDb()

  const allEvents = db
    .select({
      id: events.id,
      name: events.name,
      type: events.type,
      date: events.date,
      location: events.location,
      description: events.description,
      createdAt: events.createdAt,
      updatedAt: events.updatedAt,
    })
    .from(events)
    .orderBy(events.createdAt)
    .all()

  // Attach summary counts for each event
  return allEvents.map((event) => {
    const eventLocations = db.select({ id: locations.id }).from(locations).where(eq(locations.eventId, event.id)).all()
    const locationIds = eventLocations.map(l => l.id)

    let locationCount = locationIds.length
    let boothCount = 0
    let totalProducts = 0
    let purchasedProducts = 0

    for (const locId of locationIds) {
      const eventBooths = db.select({ id: booths.id }).from(booths).where(eq(booths.locationId, locId)).all()
      boothCount += eventBooths.length
      for (const booth of eventBooths) {
        const boothProducts = db.select({ isPurchased: products.isPurchased }).from(products).where(eq(products.boothId, booth.id)).all()
        totalProducts += boothProducts.length
        purchasedProducts += boothProducts.filter(p => p.isPurchased).length
      }
    }

    return {
      ...event,
      locationCount,
      boothCount,
      totalProducts,
      purchasedProducts,
    }
  })
})
