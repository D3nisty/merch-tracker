import { useDb } from '../../../db'
import { products, productPersonMarks, persons } from '../../../db/schema'
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

  const body = await readBody(event) as { personId?: string; isPlanned?: boolean; isPurchased?: boolean; quantity?: number }

  // Resolve target person. `user.personId` is already on the User row (from
  // getSessionUser), so we don't need to re-SELECT it. Editors can mark for
  // any person; view-share users can only mark their own.
  let targetPersonId: string | null
  if (body.personId) {
    if (body.personId !== user.personId) {
      const isEditor = await canEditEvent(user, eventId)
      if (!isEditor) {
        throw createError({ statusCode: 403, message: 'Can only mark for your own person' })
      }
    }
    targetPersonId = body.personId
  } else {
    targetPersonId = user.personId ?? null
  }

  if (!targetPersonId) {
    throw createError({ statusCode: 400, message: 'No person linked to this account — ask an admin to create one.' })
  }

  // Confirm the person exists (defensive; users.personId is a FK so this is rare).
  const personExists = db.select({ id: persons.id }).from(persons).where(eq(persons.id, targetPersonId)).get()
  if (!personExists) throw createError({ statusCode: 404, message: 'Person not found' })

  // Wrap upsert + aggregate recompute in a single transaction so the
  // legacy `products.isPlanned`/`isPurchased` aggregates stay in sync with
  // `product_person_marks` even under concurrent writes — and an error
  // mid-recompute rolls back the upsert instead of leaving the row written
  // with a stale aggregate.
  const ts = now()
  // Cast targetPersonId to string — TS doesn't see the throw-on-null above
  // narrowing into the closure scope.
  const personId = targetPersonId
  const { allMarks, anyPlanned, anyPurchased } = db.transaction((tx) => {
    const existing = tx.select().from(productPersonMarks)
      .where(and(eq(productPersonMarks.productId, productId), eq(productPersonMarks.personId, personId)))
      .get()

    const nextPlanned = body.isPlanned ?? existing?.isPlanned ?? false
    const nextPurchased = body.isPurchased ?? existing?.isPurchased ?? false
    let nextQuantity: number
    if (typeof body.quantity === 'number' && Number.isFinite(body.quantity)) {
      nextQuantity = Math.max(1, Math.floor(body.quantity))
    } else {
      nextQuantity = existing?.quantity ?? 1
    }

    if (!nextPlanned && !nextPurchased) {
      if (existing) {
        tx.delete(productPersonMarks).where(eq(productPersonMarks.id, existing.id)).run()
      }
    } else if (existing) {
      tx.update(productPersonMarks)
        .set({ isPlanned: nextPlanned, isPurchased: nextPurchased, quantity: nextQuantity, updatedAt: ts })
        .where(eq(productPersonMarks.id, existing.id))
        .run()
    } else {
      tx.insert(productPersonMarks).values({
        id: generateId(),
        productId,
        personId,
        isPlanned: nextPlanned,
        isPurchased: nextPurchased,
        quantity: nextQuantity,
        createdAt: ts,
        updatedAt: ts,
      }).run()
    }

    const marks = tx.select().from(productPersonMarks)
      .where(eq(productPersonMarks.productId, productId))
      .all()
    const planned = marks.some(m => m.isPlanned)
    const purchased = marks.some(m => m.isPurchased)
    tx.update(products)
      .set({ isPlanned: planned, isPurchased: purchased, updatedAt: ts })
      .where(eq(products.id, productId))
      .run()
    return { allMarks: marks, anyPlanned: planned, anyPurchased: purchased }
  })

  return {
    productId,
    marks: allMarks.map(m => ({
      personId: m.personId,
      isPlanned: m.isPlanned,
      isPurchased: m.isPurchased,
      quantity: m.quantity,
    })),
    aggregate: { isPlanned: anyPlanned, isPurchased: anyPurchased },
  }
})
