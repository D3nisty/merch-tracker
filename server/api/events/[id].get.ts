import { useDb } from '../../db'
import { events, locations, booths, products, catalogImages, productPersonMarks, boothDiscounts, locationReceipts, locationReceiptItems, locationReceiptItemMarks } from '../../db/schema'
import { eq, or, asc, inArray } from 'drizzle-orm'
import { requireEventView, canEditEvent, userBoothEditIds } from '../../utils/permissions'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const db = useDb()

  const eventRow = db.select().from(events).where(or(eq(events.id, id), eq(events.slug, id))).get()
  if (!eventRow) throw createError({ statusCode: 404, message: 'Event not found' })

  const viewer = await requireEventView(event, eventRow.id)
  const canEdit = await canEditEvent(viewer, eventRow.id)

  const locationRows = db.select().from(locations)
    .where(eq(locations.eventId, eventRow.id))
    .orderBy(asc(locations.sortOrder), asc(locations.createdAt))
    .all()

  const locationIds = locationRows.map(l => l.id)
  const boothRows = locationIds.length
    ? db.select().from(booths).orderBy(asc(booths.sortOrder), asc(booths.createdAt)).all().filter(b => locationIds.includes(b.locationId))
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

  // Location-wide receipts (travel-mode cities). One image per row; the viewer
  // pulls products from every booth under the location.
  const locationReceiptRows = locationIds.length
    ? db.select().from(locationReceipts)
        .where(inArray(locationReceipts.locationId, locationIds))
        .orderBy(asc(locationReceipts.sortOrder), asc(locationReceipts.createdAt))
        .all()
    : []

  // Ad-hoc items added directly to a receipt (not tied to any booth product).
  // Plus the per-person claim rows that the settlement math reads.
  const receiptIds = locationReceiptRows.map(r => r.id)
  const receiptItemRows = receiptIds.length
    ? db.select().from(locationReceiptItems)
        .where(inArray(locationReceiptItems.receiptId, receiptIds))
        .orderBy(asc(locationReceiptItems.sortOrder), asc(locationReceiptItems.createdAt))
        .all()
    : []
  const receiptItemIds = receiptItemRows.map(i => i.id)
  const receiptItemMarkRows = receiptItemIds.length
    ? db.select().from(locationReceiptItemMarks)
        .where(inArray(locationReceiptItemMarks.itemId, receiptItemIds))
        .all()
    : []

  // Substitute the legacy aggregate isPlanned/isPurchased on each product with
  // the requesting user's OWN mark, so existing per-product checkboxes naturally
  // show "have I marked this?" without changing every UI call site. Other
  // people's marks are exposed via the `marks` array.
  // `viewer` came from `getSessionUser` which selects the full users row, so
  // its `.personId` is the same field a second SELECT would return — using it
  // directly avoids a TOCTOU window where an admin updating their personId
  // between the two reads would yield inconsistent results.
  const viewerPersonId = viewer?.personId ?? null

  const productsWithMarks = productRows.map(p => {
    const productMarks = markRows.filter(m => m.productId === p.id)
    const myMark = viewerPersonId ? productMarks.find(m => m.personId === viewerPersonId) : undefined
    return {
      ...p,
      // Override aggregates with the requesting user's perspective.
      isPlanned: myMark?.isPlanned ?? false,
      isPurchased: myMark?.isPurchased ?? false,
      // Surface raw per-person marks so the UI can show other-person dots and
      // compute per-person totals. Quantity defaults to 1 for legacy rows that
      // were backfilled before this column existed.
      marks: productMarks.map(m => ({
        personId: m.personId,
        isPlanned: m.isPlanned,
        isPurchased: m.isPurchased,
        quantity: m.quantity ?? 1,
      })),
    }
  })

  // Per-booth edit flag: true when the viewer has event-edit (covers every
  // booth) OR a direct booth-level edit share. Stamping it on the response
  // lets the client decide whether to render edit affordances without
  // running its own permission logic.
  const editableBoothIds = canEdit
    ? new Set(boothRows.map(b => b.id)) // event-edit covers all booths
    : await userBoothEditIds(viewer)

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
        canEdit: editableBoothIds.has(booth.id),
      })),
    receipts: locationReceiptRows.filter(r => r.locationId === loc.id).map(r => ({
      ...r,
      items: receiptItemRows.filter(i => i.receiptId === r.id).map(item => ({
        ...item,
        marks: receiptItemMarkRows.filter(m => m.itemId === item.id).map(m => ({
          personId: m.personId,
          quantity: m.quantity,
        })),
      })),
    })),
  }))

  return {
    ...eventRow,
    locations: locationsWithBooths,
    viewerPersonId,
    // Event-level edit flag — true for admins, the event owner, edit-share
    // users, and global 'editor' roles. Used by the dashboard to show
    // event-wide affordances like "Add Hall" or the Share Event button.
    canEdit,
  }
})
