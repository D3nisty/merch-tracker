import { useDb } from '../../db'
import { events, locations, booths, products } from '../../db/schema'
import { eq, inArray } from 'drizzle-orm'
import { getOptionalUser } from '../../utils/auth'
import { accessibleEventIds } from '../../utils/permissions'

export default defineEventHandler(async (event) => {
  const db = useDb()
  const user = await getOptionalUser(event)
  const allowedIds = await accessibleEventIds(user)

  const baseSelect = db.select({
    id: events.id,
    slug: events.slug,
    name: events.name,
    type: events.type,
    date: events.date,
    dateTo: events.dateTo,
    location: events.location,
    description: events.description,
    isPublic: events.isPublic,
    ownerId: events.ownerId,
    createdAt: events.createdAt,
    updatedAt: events.updatedAt,
  }).from(events).orderBy(events.createdAt)

  // allowedIds === null means "admin, no filter". Otherwise an empty array means
  // the user can see nothing — short-circuit to skip the IN () empty-set quirk.
  let allEvents
  if (allowedIds === null) {
    allEvents = baseSelect.all()
  } else if (allowedIds.length === 0) {
    return []
  } else {
    allEvents = db.select({
      id: events.id,
      slug: events.slug,
      name: events.name,
      type: events.type,
      date: events.date,
      dateTo: events.dateTo,
      location: events.location,
      description: events.description,
      isPublic: events.isPublic,
      ownerId: events.ownerId,
      createdAt: events.createdAt,
      updatedAt: events.updatedAt,
    }).from(events).where(inArray(events.id, allowedIds)).orderBy(events.createdAt).all()
  }

  // Attach summary counts for each event
  return allEvents.map((ev) => {
    const eventLocations = db.select({ id: locations.id }).from(locations).where(eq(locations.eventId, ev.id)).all()
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
      ...ev,
      locationCount,
      boothCount,
      totalProducts,
      purchasedProducts,
    }
  })
})
