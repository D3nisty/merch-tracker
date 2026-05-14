import { writeFile, mkdir } from 'node:fs/promises'
import { join, extname } from 'node:path'
import { useDb } from '../../../db'
import { booths } from '../../../db/schema'
import { eq } from 'drizzle-orm'
import { generateId } from '../../../utils/id'
import { requireBoothEdit } from '../../../utils/permissions'

/**
 * Upload a small icon image for a booth (shown on the dashboard tile + the
 * booth detail header). Mirrors the floor-plan upload pattern: single
 * multipart `image` field; we write to UPLOAD_DIR with a `icon-<uuid>` prefix
 * and store the resulting `/uploads/<filename>` path on the booth row.
 *
 * The endpoint is booth-share-edit aware via `requireBoothEdit`, so an
 * artist who's only been granted edit on their own booth can replace their
 * own icon without event-edit rights.
 */
export default defineEventHandler(async (event) => {
  const boothId = getRouterParam(event, 'id')!
  const db = useDb()

  const existing = db.select().from(booths).where(eq(booths.id, boothId)).get()
  if (!existing) throw createError({ statusCode: 404, message: 'Booth not found' })
  await requireBoothEdit(event, boothId)

  const formData = await readMultipartFormData(event)
  if (!formData) throw createError({ statusCode: 400, message: 'No form data' })
  const imageFile = formData.find(f => f.name === 'image')
  if (!imageFile) throw createError({ statusCode: 400, message: 'image is required' })

  const ext = extname(imageFile.filename || '.png') || '.png'
  const filename = `icon-${generateId()}${ext}`
  const uploadDir = process.env.UPLOAD_DIR ?? join(process.cwd(), 'public', 'uploads')

  await mkdir(uploadDir, { recursive: true })
  await writeFile(join(uploadDir, filename), imageFile.data)

  const path = `/uploads/${filename}`
  db.update(booths).set({ iconPath: path }).where(eq(booths.id, boothId)).run()

  return { iconPath: path }
})
