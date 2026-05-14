import { useDb } from '../../db'
import { persons, users } from '../../db/schema'
import { eq } from 'drizzle-orm'

// Public persons endpoint — returns ONLY persons currently linked to a user
// account (i.e. `users.personId` points at them). Orphan / legacy standalone
// persons are admin-only via /api/admin/persons so they don't pollute pickers
// like the /account "View as" dropdown.
export default defineEventHandler(() => {
  const db = useDb()
  return db
    .select({
      id: persons.id,
      name: persons.name,
      color: persons.color,
      createdAt: persons.createdAt,
    })
    .from(persons)
    .innerJoin(users, eq(users.personId, persons.id))
    .all()
})
