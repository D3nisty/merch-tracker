import { writeFile, mkdir } from 'node:fs/promises'
import { join, extname } from 'node:path'
import { useDb } from '../../../db'
import { catalogImages } from '../../../db/schema'
import { eq } from 'drizzle-orm'
import { generateId } from '../../../utils/id'
import { requireBoothEdit } from '../../../utils/permissions'
import { deleteUploadedFile } from '../../../utils/uploads'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!

  const db = useDb()
  const existing = db.select().from(catalogImages).where(eq(catalogImages.id, id)).get()
  if (!existing) throw createError({ statusCode: 404, message: 'Image not found' })
  await requireBoothEdit(event, existing.boothId)

  const formData = await readMultipartFormData(event)
  if (!formData) throw createError({ statusCode: 400, message: 'No form data' })

  const imageFile = formData.find(f => f.name === 'image')
  if (!imageFile) throw createError({ statusCode: 400, message: 'image is required' })

  const ext = extname(imageFile.filename || '.jpg') || '.jpg'
  const filename = `${generateId()}${ext}`
  const uploadDir = process.env.UPLOAD_DIR ?? join(process.cwd(), 'public', 'uploads')
  await mkdir(uploadDir, { recursive: true })
  await writeFile(join(uploadDir, filename), imageFile.data)

  const updates = {
    filename,
    originalName: imageFile.filename || filename,
    path: `/uploads/${filename}`,
  }

  db.update(catalogImages).set(updates).where(eq(catalogImages.id, id)).run()
  // Drop the previous local file after the row update succeeds. Helper
  // no-ops for external URLs / missing files.
  await deleteUploadedFile(existing.path)

  return { ...existing, ...updates }
})
