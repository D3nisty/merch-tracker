import { useDb } from '../../db'
import { booths } from '../../db/schema'
import { eq } from 'drizzle-orm'
import { requireRole } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  await requireRole(event, ['admin', 'editor'])
  const id = getRouterParam(event, 'id')!
  const db = useDb()

  const existing = db.select().from(booths).where(eq(booths.id, id)).get()
  if (!existing) throw createError({ statusCode: 404, message: 'Booth not found' })

  db.delete(booths).where(eq(booths.id, id)).run()

  return { success: true }
})
