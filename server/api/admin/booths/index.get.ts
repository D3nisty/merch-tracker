import { useDb } from '../../../db'
import { booths, locations, events } from '../../../db/schema'
import { eq } from 'drizzle-orm'
import { requireRole } from '../../../utils/auth'

/**
 * Flat list of every booth in the system, with parent location + event info
 * baked in. Used by the admin permissions page to render a "pick booths"
 * multi-select that displays "EventName / Hall / BoothName" — much nicer
 * than asking the user to navigate event-by-event.
 *
 * Admin-only: the response leaks all booth names + their event slugs, which
 * is the right level of sensitivity for an admin tool.
 */
export default defineEventHandler(async (event) => {
  await requireRole(event, ['admin'])
  const db = useDb()

  return db
    .select({
      id: booths.id,
      slug: booths.slug,
      name: booths.name,
      hallNr: booths.hallNr,
      boothNr: booths.boothNr,
      iconPath: booths.iconPath,
      locationId: booths.locationId,
      locationName: locations.name,
      eventId: events.id,
      eventName: events.name,
      eventSlug: events.slug,
    })
    .from(booths)
    .innerJoin(locations, eq(booths.locationId, locations.id))
    .innerJoin(events, eq(locations.eventId, events.id))
    .orderBy(events.name, locations.name, booths.name)
    .all()
})
