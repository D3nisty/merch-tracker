import { useDb } from '../../db'
import { events, locations, booths, products, productPersonMarks, users } from '../../db/schema'
import { eq, and, inArray, or } from 'drizzle-orm'
import { requireUser } from '../../utils/auth'

// Bulk-unmark "purchased" for the requesting user. Body shape:
//   {}                       → clear EVERY purchase across all events
//   { eventId: '...' }       → clear purchases scoped to ONE event (id or slug)
//
// Implementation: flip isPurchased=false on every matching mark row, then for
// any row that ends up with both flags false (no longer planned, no longer
// purchased), delete the row to keep the table lean. Also recompute the
// legacy aggregate `products.isPurchased`/`isPlanned` to match the OR-of-all
// marks for each touched product.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const db = useDb()

  const me = db.select({ personId: users.personId }).from(users).where(eq(users.id, user.id)).get()
  if (!me?.personId) return { cleared: 0 }

  const body = (await readBody(event).catch(() => ({}))) as { eventId?: string }

  // Resolve the set of productIds we're allowed to touch.
  let touchedProductIds: string[] = []
  if (body.eventId) {
    const eventRow = db.select().from(events).where(or(eq(events.id, body.eventId), eq(events.slug, body.eventId))).get()
    if (!eventRow) throw createError({ statusCode: 404, message: 'Event not found' })
    const ids = db
      .select({ id: products.id })
      .from(products)
      .innerJoin(booths, eq(products.boothId, booths.id))
      .innerJoin(locations, eq(booths.locationId, locations.id))
      .where(eq(locations.eventId, eventRow.id))
      .all()
      .map(r => r.id)
    touchedProductIds = ids
  }
  // else: leave empty → no productId filter → all events

  // Find all my marks to clear.
  const marks = touchedProductIds.length
    ? db.select().from(productPersonMarks).where(and(
        eq(productPersonMarks.personId, me.personId),
        eq(productPersonMarks.isPurchased, true),
        inArray(productPersonMarks.productId, touchedProductIds),
      )).all()
    : db.select().from(productPersonMarks).where(and(
        eq(productPersonMarks.personId, me.personId),
        eq(productPersonMarks.isPurchased, true),
      )).all()

  if (marks.length === 0) return { cleared: 0 }

  for (const m of marks) {
    if (m.isPlanned) {
      // Keep the row, just unflip purchased
      db.update(productPersonMarks)
        .set({ isPurchased: false, updatedAt: new Date().toISOString() })
        .where(eq(productPersonMarks.id, m.id))
        .run()
    } else {
      // Both flags would be false → delete
      db.delete(productPersonMarks).where(eq(productPersonMarks.id, m.id)).run()
    }
  }

  // Recompute legacy aggregate per touched product.
  const productIds = Array.from(new Set(marks.map(m => m.productId)))
  for (const pid of productIds) {
    const all = db.select().from(productPersonMarks).where(eq(productPersonMarks.productId, pid)).all()
    const anyPlanned = all.some(m => m.isPlanned)
    const anyPurchased = all.some(m => m.isPurchased)
    db.update(products)
      .set({ isPlanned: anyPlanned, isPurchased: anyPurchased, updatedAt: new Date().toISOString() })
      .where(eq(products.id, pid))
      .run()
  }

  return { cleared: marks.length }
})
