import { useDb } from '../../db'
import { persons } from '../../db/schema'

export default defineEventHandler(() => {
  const db = useDb()
  return db.select().from(persons).all()
})
