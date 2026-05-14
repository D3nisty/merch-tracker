import { useDb } from '../../../db'
import { persons, users, productPersonMarks, products } from '../../../db/schema'
import { eq, sql } from 'drizzle-orm'
import { requireRole } from '../../../utils/auth'

// List all Person rows for the admin "Cleanup persons" UI. Reports:
//   - linkedUser (if a User row has this person in `users.personId`)
//   - markCount  (how many product_person_marks reference this person)
//   - productCount (how many products were drawn by this person, via products.person_id)
// Lets the admin spot legacy/orphan persons (no linked user) and decide
// whether they're still load-bearing before deleting.
export default defineEventHandler(async (event) => {
  await requireRole(event, ['admin'])
  const db = useDb()

  const personRows = db.select().from(persons).orderBy(persons.createdAt).all()

  const linkedUsers = db.select({ personId: users.personId, userId: users.id, username: users.username })
    .from(users)
    .where(sql`${users.personId} IS NOT NULL`)
    .all()
  const linkedByPerson = new Map<string, { userId: string; username: string }>()
  for (const u of linkedUsers) if (u.personId) linkedByPerson.set(u.personId, { userId: u.userId, username: u.username })

  const markRows = db.select({ personId: productPersonMarks.personId, c: sql<number>`count(*)` })
    .from(productPersonMarks)
    .groupBy(productPersonMarks.personId)
    .all()
  const marksByPerson = new Map<string, number>(markRows.map(r => [r.personId, Number(r.c)]))

  const productRows = db.select({ personId: products.personId, c: sql<number>`count(*)` })
    .from(products)
    .where(sql`${products.personId} IS NOT NULL`)
    .groupBy(products.personId)
    .all()
  const productsByPerson = new Map<string, number>(productRows.map(r => [r.personId as string, Number(r.c)]))

  return personRows.map(p => ({
    id: p.id,
    name: p.name,
    color: p.color,
    createdAt: p.createdAt,
    linkedUser: linkedByPerson.get(p.id) ?? null,
    markCount: marksByPerson.get(p.id) ?? 0,
    productCount: productsByPerson.get(p.id) ?? 0,
  }))
})
