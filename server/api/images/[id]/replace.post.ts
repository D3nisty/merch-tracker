import { writeFile, mkdir } from 'node:fs/promises'
import { join, extname } from 'node:path'
import { useDb } from '../../../db'
import { catalogImages } from '../../../db/schema'
import { eq } from 'drizzle-orm'
import { generateId } from '../../../utils/id'
import { requireRole } from '../../../utils/auth'

export default defineEventHandler(async (event) => {
  await requireRole(event, ['admin', 'editor'])
  const id = getRouterParam(event, 'id')!
  const formData = await readMultipartFormData(event)
  if (!formData) throw createError({ statusCode: 400, message: 'No form data' })

  const imageFile = formData.find(f => f.name === 'image')
  if (!imageFile) throw createError({ statusCode: 400, message: 'image is required' })

  const db = useDb()
  const existing = db.select().from(catalogImages).where(eq(catalogImages.id, id)).get()
  if (!existing) throw createError({ statusCode: 404, message: 'Image not found' })

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

  return { ...existing, ...updates }
})
