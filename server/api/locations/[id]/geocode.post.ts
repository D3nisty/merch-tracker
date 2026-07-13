import { useDb } from '../../../db'
import { locations, events } from '../../../db/schema'
import { eq } from 'drizzle-orm'
import { requireEventEdit } from '../../../utils/permissions'
import { geocode } from '../../../utils/geocode'

/**
 * Geocode a city location (by name, with the event's country as a hint) and
 * persist lat/lng for the trip map. Idempotent-ish: re-runs overwrite.
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const db = useDb()
  const loc = db.select().from(locations).where(eq(locations.id, id)).get()
  if (!loc) throw createError({ statusCode: 404, message: 'Location not found' })
  await requireEventEdit(event, loc.eventId)

  const ev = db.select({ location: events.location }).from(events).where(eq(events.id, loc.eventId)).get()
  const countryHint = ev?.location ? ev.location.split(',').pop()!.trim() : ''
  const query = [loc.name, countryHint].filter(Boolean).join(', ')

  const hit = await geocode(query) ?? (countryHint ? await geocode(loc.name) : null)
  if (!hit) throw createError({ statusCode: 422, message: `Could not locate "${loc.name}"` })

  db.update(locations).set({ latitude: hit.lat, longitude: hit.lon }).where(eq(locations.id, id)).run()
  return { id, latitude: hit.lat, longitude: hit.lon }
})
