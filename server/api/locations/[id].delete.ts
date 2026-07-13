import { useDb } from '../../db'
import { locations, booths, catalogImages, locationReceipts, itineraryItems, itineraryAttachments } from '../../db/schema'
import { eq, inArray } from 'drizzle-orm'
import { requireEventEdit } from '../../utils/permissions'
import { deleteUploadedFiles } from '../../utils/uploads'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const db = useDb()

  const existing = db.select().from(locations).where(eq(locations.id, id)).get()
  if (!existing) throw createError({ statusCode: 404, message: 'Location not found' })

  await requireEventEdit(event, existing.eventId)

  // Collect every uploaded file referenced under this location before the
  // cascade fires: the location's floor plan, every booth icon under it,
  // and every catalog image under those booths.
  const boothRows = db.select({ id: booths.id, iconPath: booths.iconPath })
    .from(booths)
    .where(eq(booths.locationId, id))
    .all()
  const boothIds = boothRows.map(b => b.id)
  const images = boothIds.length
    ? db.select({ path: catalogImages.path })
        .from(catalogImages)
        .where(inArray(catalogImages.boothId, boothIds))
        .all()
    : []
  const receipts = db.select({ path: locationReceipts.path })
    .from(locationReceipts)
    .where(eq(locationReceipts.locationId, id))
    .all()
  const itinFiles = db.select({ path: itineraryItems.attachmentPath })
    .from(itineraryItems)
    .where(eq(itineraryItems.locationId, id))
    .all()
  const itinAttFiles = db.select({ path: itineraryAttachments.path })
    .from(itineraryAttachments)
    .innerJoin(itineraryItems, eq(itineraryItems.id, itineraryAttachments.itemId))
    .where(eq(itineraryItems.locationId, id))
    .all()
  const filesToDelete: string[] = []
  if (existing.floorPlanImage) filesToDelete.push(existing.floorPlanImage)
  for (const b of boothRows) if (b.iconPath) filesToDelete.push(b.iconPath)
  for (const i of images) filesToDelete.push(i.path)
  for (const r of receipts) filesToDelete.push(r.path)
  for (const it of itinFiles) if (it.path) filesToDelete.push(it.path)
  for (const a of itinAttFiles) if (a.path) filesToDelete.push(a.path)

  db.delete(locations).where(eq(locations.id, id)).run()

  await deleteUploadedFiles(filesToDelete)

  return { success: true }
})
