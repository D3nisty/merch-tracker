import { useDb } from '../../db'
import { booths, catalogImages } from '../../db/schema'
import { eq } from 'drizzle-orm'
import { requireEventEdit, eventIdForBooth } from '../../utils/permissions'
import { deleteUploadedFiles } from '../../utils/uploads'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const db = useDb()

  const existing = db.select().from(booths).where(eq(booths.id, id)).get()
  if (!existing) throw createError({ statusCode: 404, message: 'Booth not found' })

  const eventId = await eventIdForBooth(existing.id)
  if (!eventId) throw createError({ statusCode: 404, message: 'Booth not found' })
  await requireEventEdit(event, eventId)

  // Gather every local upload path under this booth BEFORE the DB cascade
  // fires — catalog_images rows are about to be wiped (ON DELETE CASCADE),
  // so we can't query them afterwards. Includes catalog/article/receipt
  // images AND the booth's own icon.
  const images = db.select({ path: catalogImages.path })
    .from(catalogImages)
    .where(eq(catalogImages.boothId, id))
    .all()
  const filesToDelete: string[] = images.map(i => i.path)
  if (existing.iconPath) filesToDelete.push(existing.iconPath)

  db.delete(booths).where(eq(booths.id, id)).run()

  await deleteUploadedFiles(filesToDelete)

  return { success: true }
})
