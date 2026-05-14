import { useDb } from '../../db'
import { events, locations, booths, products, catalogImages, productPersonMarks, boothDiscounts, users } from '../../db/schema'
import { eq, or } from 'drizzle-orm'
import { requireEventView, canEditEvent } from '../../utils/permissions'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const db = useDb()

  const eventRow = db.select().from(events).where(or(eq(events.id, id), eq(events.slug, id))).get()
  if (!eventRow) throw createError({ statusCode: 404, message: 'Event not found' })

  const viewer = await requireEventView(event, eventRow.id)
  const canEdit = await canEditEvent(viewer, eventRow.id)

  const locationRows = db.select().from(locations).where(eq(locations.eventId, eventRow.id)).all()

  const locationIds = locationRows.map(l => l.id)
  const boothRows = locationIds.length
    ? db.select().from(booths).all().filter(b => locationIds.includes(b.locationId))
    : []

  const boothIds = boothRows.map(b => b.id)

  let productRows = boothIds.length
    ? db.select().from(products).all().filter(p => boothIds.includes(p.boothId))
    : []

  // Per-product visibility filter:
  //   - admin / event owner / edit-shared (canEdit === true): see everything
  //   - view-only: only see products with no owner (legacy), the event owner's,
  //     or the viewer's own. Prevents one shared collaborator from seeing
  //     another collaborator's private wishlist.
  if (!canEdit) {
    const viewerId = viewer?.id ?? null
    productRows = productRows.filter(p =>
      p.ownerId === null ||
      p.ownerId === eventRow.ownerId ||
      (viewerId !== null && p.ownerId === viewerId)
    )
  }

  const imageRows = boothIds.length
    ? db.select().from(catalogImages).all().filter(i => boothIds.includes(i.boothId))
    : []

  const productIds = productRows.map(p => p.id)
  const markRows = productIds.length
    ? db.select().from(productPersonMarks).all().filter(m => productIds.includes(m.productId))
    : []

  const discountRows = boothIds.length
    ? db.select().from(boothDiscounts).all().filter(d => boothIds.includes(d.boothId))
    : []

  // Substitute the legacy aggregate isPlanned/isPurchased on each product with
  // the requesting user's OWN mark, so existing per-product checkboxes naturally
  // show "have I marked this?" without changing every UI call site. Other
  // people's marks are exposed via the `marks` array.
  const viewerPersonId = viewer
    ? (db.select({ personId: users.personId }).from(users).where(eq(users.id, viewer.id)).get()?.personId ?? null)
    : null

  const productsWithMarks = productRows.map(p => {
    const productMarks = markRows.filter(m => m.productId === p.id)
    const myMark = viewerPersonId ? productMarks.find(m => m.personId === viewerPersonId) : undefined
    return {
      ...p,
      // Override aggregates with the requesting user's perspective.
      isPlanned: myMark?.isPlanned ?? false,
      isPurchased: myMark?.isPurchased ?? false,
      // Surface raw per-person marks so the UI can show other-person dots and
      // compute per-person totals.
      marks: productMarks.map(m => ({
        personId: m.personId,
        isPlanned: m.isPlanned,
        isPurchased: m.isPurchased,
      })),
    }
  })

  // Assemble nested structure
  const locationsWithBooths = locationRows.map(loc => ({
    ...loc,
    booths: boothRows
      .filter(b => b.locationId === loc.id)
      .map(booth => ({
        ...booth,
        products: productsWithMarks.filter(p => p.boothId === booth.id),
        images: imageRows.filter(i => i.boothId === booth.id),
        discounts: discountRows.filter(d => d.boothId === booth.id),
      })),
  }))

  return {
    ...eventRow,
    locations: locationsWithBooths,
    viewerPersonId,
  }
})
