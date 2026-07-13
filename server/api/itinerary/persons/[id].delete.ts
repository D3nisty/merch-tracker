import { useDb } from '../../../db'
import { itineraryItems, itineraryItemPersons } from '../../../db/schema'
import { eq } from 'drizzle-orm'
import { requireEventEdit } from '../../../utils/permissions'

// Remove a person assignment from an itinerary entry.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const db = useDb()
  const row = db.select().from(itineraryItemPersons).where(eq(itineraryItemPersons.id, id)).get()
  if (!row) throw createError({ statusCode: 404, message: 'Assignment not found' })

  const item = db.select({ eventId: itineraryItems.eventId }).from(itineraryItems).where(eq(itineraryItems.id, row.itemId)).get()
  if (!item) throw createError({ statusCode: 404, message: 'Itinerary item not found' })
  await requireEventEdit(event, item.eventId)

  db.delete(itineraryItemPersons).where(eq(itineraryItemPersons.id, id)).run()
  return { success: true }
})
