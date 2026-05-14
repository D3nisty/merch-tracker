import { useDb } from '../../db'
import { persons } from '../../db/schema'
import { eq } from 'drizzle-orm'
import { getOptionalUser } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  const user = await getOptionalUser(event)
  if (!user) return null

  // Resolve the linked person so the client can show the user's identity color.
  let person: { id: string; name: string; color: string } | null = null
  if (user.personId) {
    const db = useDb()
    const row = db.select({ id: persons.id, name: persons.name, color: persons.color })
      .from(persons).where(eq(persons.id, user.personId)).get()
    if (row) person = row
  }

  return {
    id: user.id,
    username: user.username,
    role: user.role,
    personId: user.personId,
    person,
  }
})
