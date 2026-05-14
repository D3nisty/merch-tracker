import { useDb } from '../../db'
import { events, locations, booths, products, productPersonMarks, users } from '../../db/schema'
import { eq, and } from 'drizzle-orm'
import { requireUser } from '../../utils/auth'

// Returns every product the requesting user has marked as PURCHASED for
// their own person, grouped by event. Powers the "My purchases" section on
// /account so users can spot doubled-up marks (legacy + new person) and
// unmark them without hunting through every booth.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const db = useDb()

  const me = db.select({ personId: users.personId }).from(users).where(eq(users.id, user.id)).get()
  if (!me?.personId) return [] as Array<unknown>

  const rows = db
    .select({
      eventId: events.id,
      eventSlug: events.slug,
      eventName: events.name,
      boothId: booths.id,
      boothSlug: booths.slug,
      boothName: booths.name,
      productId: products.id,
      productName: products.name,
      productSize: products.size,
      productCategory: products.category,
      productPrice: products.price,
      productCurrency: products.currency,
      productQuantity: products.quantity,
      markQuantity: productPersonMarks.quantity,
      markId: productPersonMarks.id,
      isPlanned: productPersonMarks.isPlanned,
    })
    .from(productPersonMarks)
    .innerJoin(products, eq(productPersonMarks.productId, products.id))
    .innerJoin(booths, eq(products.boothId, booths.id))
    .innerJoin(locations, eq(booths.locationId, locations.id))
    .innerJoin(events, eq(locations.eventId, events.id))
    .where(and(
      eq(productPersonMarks.personId, me.personId),
      eq(productPersonMarks.isPurchased, true),
    ))
    .all()

  // Group by event for the UI.
  const byEvent = new Map<string, {
    eventId: string
    eventSlug: string | null
    eventName: string
    totals: Record<string, number>
    items: Array<{
      boothId: string
      boothSlug: string | null
      boothName: string
      productId: string
      productName: string
      size: string | null
      category: string | null
      price: number | null
      currency: string
      quantity: number       // per-person mark quantity (what the user bought)
      defaultQty: number     // products.quantity (legacy default, mostly 1)
      isPlanned: boolean
    }>
  }>()

  for (const r of rows) {
    if (!byEvent.has(r.eventId)) {
      byEvent.set(r.eventId, {
        eventId: r.eventId,
        eventSlug: r.eventSlug,
        eventName: r.eventName,
        totals: {},
        items: [],
      })
    }
    const bucket = byEvent.get(r.eventId)!
    const markQty = Math.max(1, r.markQuantity ?? 1)
    bucket.items.push({
      boothId: r.boothId,
      boothSlug: r.boothSlug,
      boothName: r.boothName,
      productId: r.productId,
      productName: r.productName,
      size: r.productSize,
      category: r.productCategory,
      price: r.productPrice,
      currency: r.productCurrency,
      quantity: markQty,
      defaultQty: r.productQuantity,
      isPlanned: r.isPlanned,
    })
    if (r.productPrice) {
      const cur = r.productCurrency || 'EUR'
      bucket.totals[cur] = (bucket.totals[cur] ?? 0) + r.productPrice * markQty
    }
  }

  return Array.from(byEvent.values()).sort((a, b) => a.eventName.localeCompare(b.eventName))
})
