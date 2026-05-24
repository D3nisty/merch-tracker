import { writeFile, mkdir } from 'node:fs/promises'
import { join, extname } from 'node:path'
import { useDb } from '../../db'
import { locationReceipts } from '../../db/schema'
import { eq, max } from 'drizzle-orm'
import { generateId, now } from '../../utils/id'
import { requireEventEdit, eventIdForLocation } from '../../utils/permissions'

export default defineEventHandler(async (event) => {
  const formData = await readMultipartFormData(event)
  if (!formData) throw createError({ statusCode: 400, message: 'No form data' })

  const locationIdField = formData.find(f => f.name === 'locationId')
  const imageFile = formData.find(f => f.name === 'image')
  const displayModeField = formData.find(f => f.name === 'displayMode')
  const splitCountField = formData.find(f => f.name === 'splitCount')
  const customNameField = formData.find(f => f.name === 'customName')
  const latitudeField = formData.find(f => f.name === 'latitude')
  const longitudeField = formData.find(f => f.name === 'longitude')

  if (!locationIdField || !imageFile) {
    throw createError({ statusCode: 400, message: 'locationId and image are required' })
  }

  const locationId = locationIdField.data.toString()
  const eventId = await eventIdForLocation(locationId)
  if (!eventId) throw createError({ statusCode: 404, message: 'Location not found' })
  await requireEventEdit(event, eventId)

  const ext = extname(imageFile.filename || '.jpg') || '.jpg'
  const filename = `${generateId()}${ext}`
  const uploadDir = process.env.UPLOAD_DIR ?? join(process.cwd(), 'public', 'uploads')

  await mkdir(uploadDir, { recursive: true })
  await writeFile(join(uploadDir, filename), imageFile.data)

  const db = useDb()

  const maxResult = db.select({ m: max(locationReceipts.sortOrder) })
    .from(locationReceipts)
    .where(eq(locationReceipts.locationId, locationId))
    .get()
  const nextOrder = (maxResult?.m ?? -10) + 10

  const parseCoord = (raw: string | undefined, min: number, max: number): number | null => {
    if (!raw) return null
    const n = parseFloat(raw)
    return Number.isFinite(n) && n >= min && n <= max ? n : null
  }
  const latitude = parseCoord(latitudeField?.data.toString(), -90, 90)
  const longitude = parseCoord(longitudeField?.data.toString(), -180, 180)

  const newReceipt = {
    id: generateId(),
    locationId,
    filename,
    originalName: imageFile.filename || filename,
    path: `/uploads/${filename}`,
    displayMode: (displayModeField?.data.toString() ?? 'full') as 'full' | 'split',
    splitCount: splitCountField ? parseInt(splitCountField.data.toString()) : 2,
    sortOrder: nextOrder,
    customName: customNameField?.data.toString() || null,
    latitude,
    longitude,
    createdAt: now(),
  }

  db.insert(locationReceipts).values(newReceipt).run()

  return newReceipt
})
