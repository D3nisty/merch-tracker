import { writeFile, mkdir } from 'node:fs/promises'
import { join, extname } from 'node:path'
import { useDb } from '../../db'
import { itineraryItems, itineraryAttachments } from '../../db/schema'
import { eq, max } from 'drizzle-orm'
import { generateId, now } from '../../utils/id'
import { requireEventEdit } from '../../utils/permissions'

/**
 * Attach one or more ticket / reservation files (PDFs or screenshot / QR-code
 * images) to an itinerary item. Multiple `file` parts are accepted; each is
 * appended (not replaced). Gated by event-edit. Returns the item's full,
 * ordered attachment list.
 */
export default defineEventHandler(async (event) => {
  const formData = await readMultipartFormData(event)
  if (!formData) throw createError({ statusCode: 400, message: 'No form data' })

  const itemId = formData.find(f => f.name === 'itemId')?.data.toString()
  const files = formData.filter(f => f.name === 'file' && f.data?.length)
  if (!itemId || !files.length) throw createError({ statusCode: 400, message: 'itemId and at least one file are required' })

  const db = useDb()
  const item = db.select().from(itineraryItems).where(eq(itineraryItems.id, itemId)).get()
  if (!item) throw createError({ statusCode: 404, message: 'Itinerary item not found' })
  await requireEventEdit(event, item.eventId)

  const uploadDir = process.env.UPLOAD_DIR ?? join(process.cwd(), 'public', 'uploads')
  await mkdir(uploadDir, { recursive: true })

  const maxRow = db.select({ m: max(itineraryAttachments.sortOrder) })
    .from(itineraryAttachments).where(eq(itineraryAttachments.itemId, itemId)).get()
  let order = (maxRow?.m ?? -10) + 10

  for (const file of files) {
    const ext = extname(file.filename || '') || '.png'
    const filename = `ticket-${itemId}-${generateId()}${ext}`
    await writeFile(join(uploadDir, filename), file.data)
    db.insert(itineraryAttachments).values({
      id: generateId(),
      itemId,
      path: `/uploads/${filename}`,
      name: file.filename || filename,
      sortOrder: order,
      createdAt: now(),
    }).run()
    order += 10
  }

  return db.select().from(itineraryAttachments)
    .where(eq(itineraryAttachments.itemId, itemId))
    .orderBy(itineraryAttachments.sortOrder)
    .all()
})
