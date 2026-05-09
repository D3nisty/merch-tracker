import { useDb } from '../../db'
import { events, locations, booths, products } from '../../db/schema'
import { eq, sql } from 'drizzle-orm'

export default defineEventHandler(async () => {
  const db = useDb()

  const rows = db
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

  return rows
})
