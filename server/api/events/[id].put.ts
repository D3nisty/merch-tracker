import { useDb } from '../../db'
import { events } from '../../db/schema'
import { eq, or } from 'drizzle-orm'
import { now } from '../../utils/id'

export default defineEventHandler(async (event) => {
  const idOrSlug = getRouterParam(event, 'id')!
  const body = await readBody(event)
  const db = useDb()

  const existing = db.select().from(events).where(or(eq(events.id, idOrSlug), eq(events.slug, idOrSlug))).get()
  if (!existing) throw createError({ statusCode: 404, message: 'Event not found' })

  const updated = {
    name: body.name ?? existing.name,
    type: body.type ?? existing.type,
    date: body.date !== undefined ? body.date : existing.date,
    location: body.location !== undefined ? body.location : existing.location,
    description: body.description !== undefined ? body.description : existing.description,
    updatedAt: now(),
  }

  db.update(events).set(updated).where(eq(events.id, existing.id)).run()

  return { ...existing, ...updated }
})
