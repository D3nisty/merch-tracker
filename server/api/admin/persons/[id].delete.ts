import { useDb } from '../../../db'
import { persons, users } from '../../../db/schema'
import { eq } from 'drizzle-orm'
import { requireRole } from '../../../utils/auth'

// Delete a Person row. ON DELETE CASCADE on product_person_marks removes
// their marks. `users.personId` and `products.personId` use SET NULL so
// users keep their accounts and the original drawer link is just nullified.
//
// Safety rail: cannot delete a Person currently linked to a User — admin
// must first reassign or delete the User, otherwise that User would lose
// their colour and the per-person mark flow would break for them.
export default defineEventHandler(async (event) => {
  await requireRole(event, ['admin'])
  const id = getRouterParam(event, 'id')!
  const db = useDb()

  const linked = db.select({ id: users.id, username: users.username })
    .from(users).where(eq(users.personId, id)).get()
  if (linked) {
    throw createError({
      statusCode: 409,
      message: `Person is linked to user "${linked.username}" — reassign or delete the user first.`,
    })
  }

  const existing = db.select().from(persons).where(eq(persons.id, id)).get()
  if (!existing) throw createError({ statusCode: 404, message: 'Person not found' })

  db.delete(persons).where(eq(persons.id, id)).run()
  return { ok: true, id }
})
