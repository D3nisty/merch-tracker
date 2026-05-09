import { writeFile, mkdir } from 'node:fs/promises'
import { join, extname } from 'node:path'
import { useDb } from '../../db'
import { catalogImages } from '../../db/schema'
import { eq, max } from 'drizzle-orm'
import { generateId, now } from '../../utils/id'

export default defineEventHandler(async (event) => {
  const formData = await readMultipartFormData(event)
  if (!formData) throw createError({ statusCode: 400, message: 'No form data' })

  const boothIdField = formData.find(f => f.name === 'boothId')
  const imageFile = formData.find(f => f.name === 'image')
  const displayModeField = formData.find(f => f.name === 'displayMode')
  const splitCountField = formData.find(f => f.name === 'splitCount')
  const sortOrderField = formData.find(f => f.name === 'sortOrder')
  const customNameField = formData.find(f => f.name === 'customName')
  const imageTypeField = formData.find(f => f.name === 'imageType')

  if (!boothIdField || !imageFile) {
    throw createError({ statusCode: 400, message: 'boothId and image are required' })
  }

  const boothId = boothIdField.data.toString()
  const ext = extname(imageFile.filename || '.jpg') || '.jpg'
  const filename = `${generateId()}${ext}`
  const uploadDir = join(process.cwd(), 'public', 'uploads')

  await mkdir(uploadDir, { recursive: true })
  await writeFile(join(uploadDir, filename), imageFile.data)

  const db = useDb()
  const id = generateId()

  // Place new image after all existing ones for this booth
  const maxResult = db.select({ m: max(catalogImages.sortOrder) }).from(catalogImages).where(eq(catalogImages.boothId, boothId)).get()
  const nextOrder = sortOrderField ? parseInt(sortOrderField.data.toString()) : ((maxResult?.m ?? -10) + 10)

  const newImage = {
    id,
    boothId,
    filename,
    originalName: imageFile.filename || filename,
    path: `/uploads/${filename}`,
    displayMode: (displayModeField?.data.toString() ?? 'full') as 'full' | 'split',
    splitCount: splitCountField ? parseInt(splitCountField.data.toString()) : 2,
    sortOrder: nextOrder,
    customName: customNameField?.data.toString() || null,
    imageType: (imageTypeField?.data.toString() ?? 'catalog') as 'catalog' | 'article',
    createdAt: now(),
  }

  db.insert(catalogImages).values(newImage).run()

  return newImage
})
