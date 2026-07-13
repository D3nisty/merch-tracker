import { useDb } from '../../../db'
import { itineraryItems, itineraryItemPersons, persons } from '../../../db/schema'
import { eq, max } from 'drizzle-orm'
import { generateId, now } from '../../../utils/id'
import { requireEventEdit } from '../../../utils/permissions'

// Assign a person to an itinerary entry. Body is either { personId } to attach a
// known Person (pickable from the trip's participants / account users) or
// { name } for a free-text name of someone without an account.
export default defineEventHandler(async (event) => {
  const itemId = getRouterParam(event, 'id')!
  const db = useDb()
  const item = db.select({ eventId: itineraryItems.eventId }).from(itineraryItems).where(eq(itineraryItems.id, itemId)).get()
  if (!item) throw createError({ statusCode: 404, message: 'Itinerary item not found' })
  await requireEventEdit(event, item.eventId)

  const body = await readBody(event) as { personId?: string | null; name?: string | null }
  const personId = body.personId?.trim() || null
  const manualName = body.name?.trim() || null
  if (!personId && !manualName) {
    throw createError({ statusCode: 400, message: 'personId or name is required' })
  }

  // Resolve / validate a person reference and skip re-adding the same one.
  let person: { id: string; name: string; color: string | null } | undefined
  if (personId) {
    person = db.select({ id: persons.id, name: persons.name, color: persons.color })
      .from(persons).where(eq(persons.id, personId)).get()
    if (!person) throw createError({ statusCode: 404, message: 'Person not found' })
    const existing = db.select({ id: itineraryItemPersons.id, personId: itineraryItemPersons.personId })
      .from(itineraryItemPersons).where(eq(itineraryItemPersons.itemId, itemId)).all()
    const dup = existing.find(r => r.personId === personId)
    if (dup) return { id: dup.id, personId, name: person.name, color: person.color }
  }

  const maxRow = db.select({ m: max(itineraryItemPersons.sortOrder) })
    .from(itineraryItemPersons).where(eq(itineraryItemPersons.itemId, itemId)).get()
  const sortOrder = (maxRow?.m ?? -10) + 10

  const row = {
    id: generateId(),
    itemId,
    personId,
    name: personId ? null : manualName,
    sortOrder,
    createdAt: now(),
  }
  db.insert(itineraryItemPersons).values(row).run()

  return {
    id: row.id,
    personId,
    name: personId ? (person?.name ?? '?') : manualName,
    color: person?.color ?? null,
  }
})
