import { useDb } from '../../../db'
import { persons, users } from '../../../db/schema'
import { sql, notInArray } from 'drizzle-orm'
import { requireRole } from '../../../utils/auth'

// Bulk delete all "orphan" Person rows — those NOT referenced by any user's
// `personId`. Used by the admin Cleanup Persons page to wipe legacy persons
// in one click after migration. Cascade fires on product_person_marks; the
// SET NULL FKs on users/products leave those untouched (no linked users to
// hit by definition of "orphan").
export default defineEventHandler(async (event) => {
  await requireRole(event, ['admin'])
  const db = useDb()

  // Collect ids of persons that ARE linked to some user.
  const linkedRows = db.select({ personId: users.personId }).from(users).where(sql`${users.personId} IS NOT NULL`).all()
  const linkedIds = linkedRows.map(r => r.personId).filter((v): v is string => !!v)

  // Delete all persons NOT in that set. Drizzle's notInArray with empty array
  // would be a no-op; in that edge case we'd actually want "delete all", but
  // that's only possible if there are zero users which never happens after
  // first-run admin seeding. Guard anyway.
  if (linkedIds.length === 0) {
    db.delete(persons).run()
  } else {
    db.delete(persons).where(notInArray(persons.id, linkedIds)).run()
  }

  // Report a count for the toast.
  const remaining = (db.select({ c: sql<number>`count(*)` }).from(persons).get()?.c ?? 0) as number
  return { ok: true, remaining }
})
