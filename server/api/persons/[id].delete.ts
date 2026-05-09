import { useDb } from '../../db'
import { persons } from '../../db/schema'
import { eq } from 'drizzle-orm'

export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id')!
  const db = useDb()
  db.delete(persons).where(eq(persons.id, id)).run()
  return { success: true }
})
