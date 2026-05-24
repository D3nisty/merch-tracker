import { useDb } from '../../db'
import { events, locations, booths, catalogImages, locationReceipts } from '../../db/schema'
import { eq, or, inArray } from 'drizzle-orm'
import { requireUser } from '../../utils/auth'
import { deleteUploadedFiles } from '../../utils/uploads'

/**
 * Deleting an entire event is destructive. Only the event owner or an admin
 * may do it — edit-shared collaborators cannot.
 */
export default defineEventHandler(async (event) => {
  const idOrSlug = getRouterParam(event, 'id')!
  const db = useDb()

  const existing = db.select().from(events).where(or(eq(events.id, idOrSlug), eq(events.slug, idOrSlug))).get()
  if (!existing) throw createError({ statusCode: 404, message: 'Event not found' })

  const user = await requireUser(event)
  if (user.role !== 'admin' && existing.ownerId !== user.id) {
    throw createError({ statusCode: 403, message: 'Only the event owner or an admin can delete an event' })
  }

  // Walk the full subtree before the ON DELETE CASCADE wipes it: every
  // location's floor plan, every booth icon, every catalog image. Collect
  // their /uploads/ paths so we can free the disk space after the row
  // delete succeeds.
  const locs = db.select({ id: locations.id, floorPlanImage: locations.floorPlanImage })
    .from(locations).where(eq(locations.eventId, existing.id)).all()
  const locationIds = locs.map(l => l.id)
  const boothRows = locationIds.length
    ? db.select({ id: booths.id, iconPath: booths.iconPath })
        .from(booths)
        .where(inArray(booths.locationId, locationIds))
        .all()
    : []
  const boothIds = boothRows.map(b => b.id)
  const images = boothIds.length
    ? db.select({ path: catalogImages.path })
        .from(catalogImages)
        .where(inArray(catalogImages.boothId, boothIds))
        .all()
    : []
  const receipts = locationIds.length
    ? db.select({ path: locationReceipts.path })
        .from(locationReceipts)
        .where(inArray(locationReceipts.locationId, locationIds))
        .all()
    : []
  const filesToDelete: string[] = []
  for (const l of locs) if (l.floorPlanImage) filesToDelete.push(l.floorPlanImage)
  for (const b of boothRows) if (b.iconPath) filesToDelete.push(b.iconPath)
  for (const i of images) filesToDelete.push(i.path)
  for (const r of receipts) filesToDelete.push(r.path)

  db.delete(events).where(eq(events.id, existing.id)).run()

  await deleteUploadedFiles(filesToDelete)

  return { success: true }
})
