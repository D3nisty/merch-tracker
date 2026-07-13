import { useDb } from '../../db'
import { events, locations, booths, products, catalogImages, locationReceipts, itineraryItems, itineraryAttachments } from '../../db/schema'
import { and, or, eq, inArray, isNotNull, sql } from 'drizzle-orm'
import { getOptionalUser } from '../../utils/auth'
import { accessibleEventIds } from '../../utils/permissions'

// Global search across everything the user can see: trips/events, cities,
// shops/booths, products, schedule (itinerary) entries, and files. The Files
// section doubles as a file-explorer — with no query it returns every file the
// user can access so the client can browse; with a query it filters by name.
export default defineEventHandler(async (event) => {
  const db = useDb()
  const user = await getOptionalUser(event)
  const allowed = await accessibleEventIds(user) // null = admin (no filter)

  const q = ((getQuery(event).q as string) || '').trim()
  const filesOnly = getQuery(event).filesOnly === '1'
  // Optional: restrict everything (results + files) to a single trip/convention.
  const eventId = (getQuery(event).eventId as string) || ''
  const qLower = q.toLowerCase()
  const hasQ = qLower.length > 0

  const empty = { events: [], locations: [], booths: [], products: [], itinerary: [], files: [] }
  // No accessible events → nothing to search.
  if (Array.isArray(allowed) && allowed.length === 0) return empty
  // Asked to scope to an event the user can't see → nothing.
  if (eventId && Array.isArray(allowed) && !allowed.includes(eventId)) return empty

  const eventScope = allowed === null ? undefined : inArray(events.id, allowed)
  const single = eventId ? eq(events.id, eventId) : undefined
  const baseConds = [eventScope, single].filter(Boolean) as any[]
  const scoped = (cond?: any) => {
    const all = [...baseConds, cond].filter(Boolean)
    return all.length ? (all.length === 1 ? all[0] : and(...all)) : undefined
  }
  const has = (col: any) => sql`lower(${col}) like ${'%' + qLower + '%'}`
  const LIMIT = 25
  const FILE_LIMIT = 400

  // ── Non-file result groups (only when there is a query) ─────────────────
  let eventRows: any[] = [], locationRows: any[] = [], boothRows: any[] = [], productRows: any[] = [], itineraryRows: any[] = []
  if (hasQ && !filesOnly) {
    eventRows = db.select({ id: events.id, slug: events.slug, name: events.name, type: events.type, location: events.location, date: events.date })
      .from(events)
      .where(scoped(or(has(events.name), has(events.location), has(events.description))))
      .limit(LIMIT).all()

    locationRows = db.select({ id: locations.id, name: locations.name, eventId: events.id, eventSlug: events.slug, eventName: events.name, eventType: events.type, dateFrom: locations.dateFrom })
      .from(locations).innerJoin(events, eq(locations.eventId, events.id))
      .where(scoped(has(locations.name)))
      .limit(LIMIT).all()

    boothRows = db.select({ id: booths.id, slug: booths.slug, name: booths.name, eventSlug: events.slug, eventName: events.name, eventType: events.type, locationName: locations.name })
      .from(booths).innerJoin(locations, eq(booths.locationId, locations.id)).innerJoin(events, eq(locations.eventId, events.id))
      .where(scoped(has(booths.name)))
      .limit(LIMIT).all()

    productRows = db.select({ id: products.id, name: products.name, price: products.price, currency: products.currency, boothSlug: booths.slug, boothName: booths.name, eventSlug: events.slug })
      .from(products).innerJoin(booths, eq(products.boothId, booths.id)).innerJoin(locations, eq(booths.locationId, locations.id)).innerJoin(events, eq(locations.eventId, events.id))
      .where(scoped(has(products.name)))
      .limit(LIMIT).all()

    itineraryRows = db.select({ id: itineraryItems.id, title: itineraryItems.title, kind: itineraryItems.kind, date: itineraryItems.date, time: itineraryItems.time, fromLoc: itineraryItems.fromLoc, toLoc: itineraryItems.toLoc, eventSlug: events.slug, eventName: events.name, eventType: events.type, locationName: locations.name })
      .from(itineraryItems).innerJoin(events, eq(itineraryItems.eventId, events.id)).innerJoin(locations, eq(itineraryItems.locationId, locations.id))
      .where(scoped(or(has(itineraryItems.title), has(itineraryItems.fromLoc), has(itineraryItems.toLoc))))
      .limit(LIMIT).all()
  }

  // ── Files (always returned; filtered by name when a query is present) ────
  const files: any[] = []
  const nameFilter = (cols: any[]) => (hasQ ? or(...cols.map(c => has(c))) : undefined)

  // 1. Itinerary attachments (tickets / QR screenshots / reservations)
  const attRows = db.select({
    id: itineraryAttachments.id, name: itineraryAttachments.name, path: itineraryAttachments.path,
    itemTitle: itineraryItems.title, itemKind: itineraryItems.kind, locationName: locations.name,
    eventId: events.id, eventSlug: events.slug, eventName: events.name, eventType: events.type,
  })
    .from(itineraryAttachments)
    .innerJoin(itineraryItems, eq(itineraryAttachments.itemId, itineraryItems.id))
    .innerJoin(locations, eq(itineraryItems.locationId, locations.id))
    .innerJoin(events, eq(itineraryItems.eventId, events.id))
    .where(scoped(nameFilter([itineraryAttachments.name, itineraryItems.title])))
    .limit(FILE_LIMIT).all()
  for (const r of attRows) {
    files.push({ id: 'att-' + r.id, name: r.name, url: r.path, fileType: 'ticket',
      eventSlug: r.eventSlug ?? r.eventId, eventName: r.eventName, eventType: r.eventType,
      context: [r.locationName, r.itemTitle].filter(Boolean).join(' · '), openTo: `/events/${r.eventSlug ?? r.eventId}` })
  }

  // 2. Catalog images (catalog pages / article photos / receipts)
  const imgRows = db.select({
    id: catalogImages.id, originalName: catalogImages.originalName, customName: catalogImages.customName,
    path: catalogImages.path, imageType: catalogImages.imageType,
    boothName: booths.name, boothSlug: booths.slug, locationName: locations.name,
    eventId: events.id, eventSlug: events.slug, eventName: events.name, eventType: events.type,
  })
    .from(catalogImages)
    .innerJoin(booths, eq(catalogImages.boothId, booths.id))
    .innerJoin(locations, eq(booths.locationId, locations.id))
    .innerJoin(events, eq(locations.eventId, events.id))
    .where(scoped(nameFilter([catalogImages.customName, catalogImages.originalName, booths.name])))
    .limit(FILE_LIMIT).all()
  for (const r of imgRows) {
    files.push({ id: 'img-' + r.id, name: r.customName || r.originalName || (r.imageType + ' image'), url: r.path, fileType: r.imageType,
      eventSlug: r.eventSlug ?? r.eventId, eventName: r.eventName, eventType: r.eventType,
      context: [r.locationName, r.boothName].filter(Boolean).join(' · '),
      openTo: r.boothSlug ? `/events/${r.eventSlug ?? r.eventId}/booth/${r.boothSlug}` : `/events/${r.eventSlug ?? r.eventId}` })
  }

  // 3. Location receipts (city-wide receipts)
  const recRows = db.select({
    id: locationReceipts.id, originalName: locationReceipts.originalName, customName: locationReceipts.customName,
    path: locationReceipts.path, locationName: locations.name,
    eventId: events.id, eventSlug: events.slug, eventName: events.name, eventType: events.type,
  })
    .from(locationReceipts)
    .innerJoin(locations, eq(locationReceipts.locationId, locations.id))
    .innerJoin(events, eq(locations.eventId, events.id))
    .where(scoped(nameFilter([locationReceipts.customName, locationReceipts.originalName, locations.name])))
    .limit(FILE_LIMIT).all()
  for (const r of recRows) {
    files.push({ id: 'rec-' + r.id, name: r.customName || r.originalName || 'Receipt', url: r.path, fileType: 'receipt',
      eventSlug: r.eventSlug ?? r.eventId, eventName: r.eventName, eventType: r.eventType,
      context: r.locationName, openTo: `/events/${r.eventSlug ?? r.eventId}` })
  }

  // 4. Floor plans (per location)
  const fpRows = db.select({
    id: locations.id, name: locations.name, path: locations.floorPlanImage,
    eventId: events.id, eventSlug: events.slug, eventName: events.name, eventType: events.type,
  })
    .from(locations).innerJoin(events, eq(locations.eventId, events.id))
    .where(scoped(and(isNotNull(locations.floorPlanImage), nameFilter([locations.name]))))
    .limit(FILE_LIMIT).all()
  for (const r of fpRows) {
    if (!r.path) continue
    files.push({ id: 'fp-' + r.id, name: r.name, url: r.path, fileType: 'floorplan',
      eventSlug: r.eventSlug ?? r.eventId, eventName: r.eventName, eventType: r.eventType,
      context: r.name, openTo: `/events/${r.eventSlug ?? r.eventId}` })
  }

  // 5. Booth icons
  const iconRows = db.select({
    id: booths.id, name: booths.name, slug: booths.slug, path: booths.iconPath, locationName: locations.name,
    eventId: events.id, eventSlug: events.slug, eventName: events.name, eventType: events.type,
  })
    .from(booths).innerJoin(locations, eq(booths.locationId, locations.id)).innerJoin(events, eq(locations.eventId, events.id))
    .where(scoped(and(isNotNull(booths.iconPath), nameFilter([booths.name]))))
    .limit(FILE_LIMIT).all()
  for (const r of iconRows) {
    if (!r.path) continue
    files.push({ id: 'icon-' + r.id, name: r.name, url: r.path, fileType: 'icon',
      eventSlug: r.eventSlug ?? r.eventId, eventName: r.eventName, eventType: r.eventType,
      context: [r.locationName, r.name].filter(Boolean).join(' · '),
      openTo: r.slug ? `/events/${r.eventSlug ?? r.eventId}/booth/${r.slug}` : `/events/${r.eventSlug ?? r.eventId}` })
  }

  files.sort((a, b) => (a.eventName || '').localeCompare(b.eventName || '') || (a.name || '').localeCompare(b.name || ''))

  return {
    events: eventRows,
    locations: locationRows,
    booths: boothRows,
    products: productRows,
    itinerary: itineraryRows,
    files: files.slice(0, FILE_LIMIT),
  }
})
