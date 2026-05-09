import { useDb } from '../../db'
import { catalogImages } from '../../db/schema'
import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const body = await readBody(event)
  const db = useDb()

  const existing = db.select().from(catalogImages).where(eq(catalogImages.id, id)).get()
  if (!existing) throw createError({ statusCode: 404, message: 'Image not found' })

  const updated: Record<string, unknown> = {}
  if (body.displayMode !== undefined) updated.displayMode = body.displayMode
  if (body.splitCount !== undefined) updated.splitCount = body.splitCount
  if (body.sortOrder !== undefined) updated.sortOrder = body.sortOrder
  if (body.customName !== undefined) updated.customName = body.customName
  if (body.imageType !== undefined) updated.imageType = body.imageType
  if (body.personId !== undefined) updated.personId = body.personId || null
  if (body.parentId !== undefined) updated.parentId = body.parentId || null

  db.update(catalogImages).set(updated).where(eq(catalogImages.id, id)).run()

  return { ...existing, ...updated }
})
