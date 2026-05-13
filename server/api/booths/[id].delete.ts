import { useDb } from '../../db'
import { booths } from '../../db/schema'
import { eq } from 'drizzle-orm'
import { requireEventEdit, eventIdForBooth } from '../../utils/permissions'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const db = useDb()

  const existing = db.select().from(booths).where(eq(booths.id, id)).get()
  if (!existing) throw createError({ statusCode: 404, message: 'Booth not found' })

  const eventId = await eventIdForBooth(existing.id)
  if (!eventId) throw createError({ statusCode: 404, message: 'Booth not found' })
  await requireEventEdit(event, eventId)

  db.delete(booths).where(eq(booths.id, id)).run()

  return { success: true }
})
