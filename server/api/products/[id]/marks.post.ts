import { useDb } from '../../../db'
import { products, productPersonMarks, persons, users } from '../../../db/schema'
import { eq, and } from 'drizzle-orm'
import { generateId, now } from '../../../utils/id'
import { requireEventMark, eventIdForProduct, canEditEvent } from '../../../utils/permissions'

// Set the requesting user's per-person mark on a product (planned / purchased
// flags). Editors may also set the mark for any other person (passing
// `personId` in the body) — useful when an editor is shopping with a friend
// and wants to tick off items for them. View-share users may only mark for
// their own linked person.
export default defineEventHandler(async (event) => {
  const productId = getRouterParam(event, 'id')!
  const db = useDb()

  const product = db.select().from(products).where(eq(products.id, productId)).get()
  if (!product) throw createError({ statusCode: 404, message: 'Product not found' })

  const eventId = await eventIdForProduct(productId)
  if (!eventId) throw createError({ statusCode: 404, message: 'Product not found' })
  const user = await requireEventMark(event, eventId)

  const body = await readBody(event) as { personId?: string; isPlanned?: boolean; isPurchased?: boolean }

  // Resolve target person. Default: requester's own person.
  let targetPersonId: string | null
  if (body.personId) {
    const isEditor = await canEditEvent(user, eventId)
    if (!isEditor) {
      // View-share / public-event users can only mark their own person.
      const me = db.select({ personId: users.personId }).from(users).where(eq(users.id, user.id)).get()
      if (me?.personId !== body.personId) {
        throw createError({ statusCode: 403, message: 'Can only mark for your own person' })
      }
    }
    targetPersonId = body.personId
  } else {
    const me = db.select({ personId: users.personId }).from(users).where(eq(users.id, user.id)).get()
    targetPersonId = me?.personId ?? null
  }

  if (!targetPersonId) {
    throw createError({ statusCode: 400, message: 'No person to mark for' })
  }

  // Confirm the person exists (defensive; users.personId is a FK so this is rare).
  const personExists = db.select({ id: persons.id }).from(persons).where(eq(persons.id, targetPersonId)).get()
  if (!personExists) throw createError({ statusCode: 404, message: 'Person not found' })

  // Upsert the mark row.
  const existing = db.select().from(productPersonMarks)
    .where(and(eq(productPersonMarks.productId, productId), eq(productPersonMarks.personId, targetPersonId)))
    .get()

  const nextPlanned = body.isPlanned ?? existing?.isPlanned ?? false
  const nextPurchased = body.isPurchased ?? existing?.isPurchased ?? false

  if (!nextPlanned && !nextPurchased) {
    // No flags left: delete the row to keep the table lean.
    if (existing) {
      db.delete(productPersonMarks).where(eq(productPersonMarks.id, existing.id)).run()
    }
  } else if (existing) {
    db.update(productPersonMarks)
      .set({ isPlanned: nextPlanned, isPurchased: nextPurchased, updatedAt: now() })
      .where(eq(productPersonMarks.id, existing.id))
      .run()
  } else {
    db.insert(productPersonMarks).values({
      id: generateId(),
      productId,
      personId: targetPersonId,
      isPlanned: nextPlanned,
      isPurchased: nextPurchased,
      createdAt: now(),
      updatedAt: now(),
    }).run()
  }

  // Recompute the legacy aggregate on the product so single-person UIs that
  // still read isPlanned/isPurchased keep showing "anyone has it" state.
  const allMarks = db.select().from(productPersonMarks)
    .where(eq(productPersonMarks.productId, productId))
    .all()
  const anyPlanned = allMarks.some(m => m.isPlanned)
  const anyPurchased = allMarks.some(m => m.isPurchased)
  db.update(products)
    .set({ isPlanned: anyPlanned, isPurchased: anyPurchased, updatedAt: now() })
    .where(eq(products.id, productId))
    .run()

  return {
    productId,
    marks: allMarks.map(m => ({
      personId: m.personId,
      isPlanned: m.isPlanned,
      isPurchased: m.isPurchased,
    })),
    aggregate: { isPlanned: anyPlanned, isPurchased: anyPurchased },
  }
})
