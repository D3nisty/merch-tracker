import { useDb } from '../../db'
import { catalogImages } from '../../db/schema'
import { eq } from 'drizzle-orm'
import { requireBoothEdit } from '../../utils/permissions'
import { deleteUploadedFiles } from '../../utils/uploads'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const db = useDb()

  const existing = db.select().from(catalogImages).where(eq(catalogImages.id, id)).get()
  if (!existing) throw createError({ statusCode: 404, message: 'Image not found' })

  await requireBoothEdit(event, existing.boothId)

  // Article galleries can have sub-images (parent_id → this image). The
  // catalog_images table has no ON DELETE CASCADE on parent_id, so collect
  // their paths here and delete the rows + files manually before the parent
  // row goes. Without this, sub-image files would stay on disk forever and
  // the sub-image DB rows would dangle with a parent_id pointing at nothing.
  const subImages = db.select({ id: catalogImages.id, path: catalogImages.path })
    .from(catalogImages).where(eq(catalogImages.parentId, id)).all()

  const filesToDelete: string[] = [existing.path]
  for (const sub of subImages) filesToDelete.push(sub.path)

  // Delete sub-image rows first, then the parent.
  for (const sub of subImages) {
    db.delete(catalogImages).where(eq(catalogImages.id, sub.id)).run()
  }
  db.delete(catalogImages).where(eq(catalogImages.id, id)).run()

  // File deletion is best-effort and never blocks the API response.
  await deleteUploadedFiles(filesToDelete)

  return { success: true }
})
