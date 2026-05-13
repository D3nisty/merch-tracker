import { writeFile, mkdir } from 'node:fs/promises'
import { join, extname } from 'node:path'
import { useDb } from '../../db'
import { locations } from '../../db/schema'
import { eq } from 'drizzle-orm'
import { generateId } from '../../utils/id'
import { requireEventEdit, eventIdForLocation } from '../../utils/permissions'

export default defineEventHandler(async (event) => {
  const formData = await readMultipartFormData(event)
  if (!formData) throw createError({ statusCode: 400, message: 'No form data' })

  const locationIdField = formData.find(f => f.name === 'locationId')
  const imageFile = formData.find(f => f.name === 'image')

  if (!locationIdField || !imageFile) {
    throw createError({ statusCode: 400, message: 'locationId and image are required' })
  }

  const locationId = locationIdField.data.toString()
  const eventId = await eventIdForLocation(locationId)
  if (!eventId) throw createError({ statusCode: 404, message: 'Location not found' })
  await requireEventEdit(event, eventId)
  const db = useDb()

  const existing = db.select().from(locations).where(eq(locations.id, locationId)).get()
  if (!existing) throw createError({ statusCode: 404, message: 'Location not found' })

  const ext = extname(imageFile.filename || '.jpg') || '.jpg'
  const filename = `floorplan-${generateId()}${ext}`
  const uploadDir = process.env.UPLOAD_DIR ?? join(process.cwd(), 'public', 'uploads')

  await mkdir(uploadDir, { recursive: true })
  await writeFile(join(uploadDir, filename), imageFile.data)

  const path = `/uploads/${filename}`
  db.update(locations).set({ floorPlanImage: path }).where(eq(locations.id, locationId)).run()

  return { path }
})
