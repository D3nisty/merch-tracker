import { useDb } from '../../../db'
import { catalogImages } from '../../../db/schema'
import { eq, and, isNull } from 'drizzle-orm'
import { requireBoothEdit } from '../../../utils/permissions'

/**
 * Body: { ids: string[] } — full ordered list of parent-image IDs for this
 * booth. Sub-images (parentId !== null) keep their own sort order under each
 * parent and aren't touched here. Refuses partial reorders so a stale client
 * can't accidentally drop an image that another tab just added.
 */
export default defineEventHandler(async (event) => {
  const boothId = getRouterParam(event, 'id')!
  await requireBoothEdit(event, boothId)

  const body = await readBody(event)
  const ids: string[] = Array.isArray(body?.ids)
    ? body.ids.filter((x: unknown): x is string => typeof x === 'string')
    : []
  if (!ids.length) throw createError({ statusCode: 400, message: 'ids[] is required' })

  const db = useDb()

  // Set of parent images currently attached to this booth.
  const existing = db.select({ id: catalogImages.id })
    .from(catalogImages)
    .where(and(eq(catalogImages.boothId, boothId), isNull(catalogImages.parentId)))
    .all()
    .map(r => r.id)

  const sentSet = new Set(ids)
  if (existing.length !== ids.length || existing.some(id => !sentSet.has(id))) {
    throw createError({ statusCode: 409, message: 'ids must contain every parent image of this booth exactly once' })
  }

  ids.forEach((id, i) => {
    db.update(catalogImages).set({ sortOrder: i }).where(eq(catalogImages.id, id)).run()
  })

  return { success: true }
})
