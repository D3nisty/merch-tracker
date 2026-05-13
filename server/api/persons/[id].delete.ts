import { useDb } from '../../db'
import { persons } from '../../db/schema'
import { eq } from 'drizzle-orm'
import { requireRole } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  await requireRole(event, ['admin', 'editor'])
  const id = getRouterParam(event, 'id')!
  const db = useDb()
  db.delete(persons).where(eq(persons.id, id)).run()
  return { success: true }
})
