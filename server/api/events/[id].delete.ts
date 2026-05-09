import { useDb } from '../../db'
import { events } from '../../db/schema'
import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const db = useDb()

  const existing = db.select().from(events).where(eq(events.id, id)).get()
  if (!existing) throw createError({ statusCode: 404, message: 'Event not found' })

  db.delete(events).where(eq(events.id, id)).run()

  return { success: true }
})
