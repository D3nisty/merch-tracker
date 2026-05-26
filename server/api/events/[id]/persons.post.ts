import { useDb } from '../../../db'
import { eventPersons, persons, events } from '../../../db/schema'
import { eq, or, and } from 'drizzle-orm'
import { generateId, now } from '../../../utils/id'
import { requireUser } from '../../../utils/auth'

/**
 * Add a person to the event's participant list. Owner-or-admin only —
 * participants drive the receipt settlement UI and shouldn't be editable
 * by every collaborator. Body: `{ personId }`. Idempotent: re-adding an
 * existing participant returns the existing row.
 */
export default defineEventHandler(async (event) => {
  const idOrSlug = getRouterParam(event, 'id')!
  const body = await readBody(event) as { personId?: string }
  if (!body.personId) throw createError({ statusCode: 400, message: 'personId is required' })

  const db = useDb()
  const ev = db.select().from(events).where(or(eq(events.id, idOrSlug), eq(events.slug, idOrSlug))).get()
  if (!ev) throw createError({ statusCode: 404, message: 'Event not found' })

  const user = await requireUser(event)
  if (user.role !== 'admin' && ev.ownerId !== user.id) {
    throw createError({ statusCode: 403, message: 'Only the event owner or an admin can manage participants' })
  }

  const person = db.select().from(persons).where(eq(persons.id, body.personId)).get()
  if (!person) throw createError({ statusCode: 404, message: 'Person not found' })

  const existing = db.select().from(eventPersons)
    .where(and(eq(eventPersons.eventId, ev.id), eq(eventPersons.personId, body.personId)))
    .get()
  if (existing) return existing

  const row = {
    id: generateId(),
    eventId: ev.id,
    personId: body.personId,
    createdAt: now(),
  }
  db.insert(eventPersons).values(row).run()
  return row
})
