import { useDb } from '../../db'
import { boothInvites, booths, locations, events } from '../../db/schema'
import { eq } from 'drizzle-orm'

/**
 * Public introspection for the booth-invite landing page. Lets the page show
 * "You've been invited to manage <booth> at <event> (edit / view)" before the
 * user commits to signup. No session needed.
 */
export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token')!
  const db = useDb()

  const row = db
    .select({
      level: boothInvites.level,
      expiresAt: boothInvites.expiresAt,
      boothId: booths.id,
      boothSlug: booths.slug,
      boothName: booths.name,
      eventId: events.id,
      eventSlug: events.slug,
      eventName: events.name,
      eventType: events.type,
      eventLocation: events.location,
    })
    .from(boothInvites)
    .innerJoin(booths, eq(boothInvites.boothId, booths.id))
    .innerJoin(locations, eq(booths.locationId, locations.id))
    .innerJoin(events, eq(locations.eventId, events.id))
    .where(eq(boothInvites.token, token))
    .get()

  if (!row) throw createError({ statusCode: 404, message: 'Invite not found' })
  if (row.expiresAt && new Date(row.expiresAt).getTime() < Date.now()) {
    throw createError({ statusCode: 410, message: 'Invite has expired' })
  }

  return {
    level: row.level,
    booth: { id: row.boothId, slug: row.boothSlug, name: row.boothName },
    event: {
      id: row.eventId,
      slug: row.eventSlug,
      name: row.eventName,
      type: row.eventType,
      location: row.eventLocation,
    },
  }
})
