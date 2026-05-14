import { useDb } from '../../db'
import { persons, users } from '../../db/schema'
import { eq } from 'drizzle-orm'

// Public persons endpoint — returns ONLY persons currently linked to a user
// account (i.e. `users.personId` points at them). Orphan / legacy standalone
// persons are admin-only via /api/admin/persons so they don't pollute pickers
// like the /account "View as" dropdown.
//
// `selectDistinct` guards the (unlikely but unconstrained) case where two
// users.personId rows point at the same person — the INNER JOIN would
// otherwise duplicate that person in the response.
export default defineEventHandler(() => {
  const db = useDb()
  return db
    .selectDistinct({
      id: persons.id,
      name: persons.name,
      color: persons.color,
      createdAt: persons.createdAt,
    })
    .from(persons)
    .innerJoin(users, eq(users.personId, persons.id))
    .all()
})
