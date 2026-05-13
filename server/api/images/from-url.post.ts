import { useDb } from '../../db'
import { catalogImages } from '../../db/schema'
import { eq, max } from 'drizzle-orm'
import { generateId, now } from '../../utils/id'
import { requireRole } from '../../utils/auth'

/**
 * Create a catalog image record that points at an external URL instead of an
 * uploaded file. The `path` column stores the full URL; the browser fetches it
 * directly. `filename` stays empty so it's clear nothing local is owned.
 */
export default defineEventHandler(async (event) => {
  await requireRole(event, ['admin', 'editor'])
  const body = await readBody(event)

  if (!body.boothId || !body.url) {
    throw createError({ statusCode: 400, message: 'boothId and url are required' })
  }
  if (!/^https?:\/\/.+/i.test(String(body.url))) {
    throw createError({ statusCode: 400, message: 'url must start with http:// or https://' })
  }

  const db = useDb()

  // Append to the end of the booth's image list (same logic as the upload endpoint).
  const maxResult = db.select({ m: max(catalogImages.sortOrder) })
    .from(catalogImages)
    .where(eq(catalogImages.boothId, body.boothId))
    .get()
  const nextOrder = (maxResult?.m ?? -10) + 10

  // Derive a readable filename from the URL path for display purposes.
  let originalName = String(body.url)
  try {
    const u = new URL(body.url)
    const last = u.pathname.split('/').filter(Boolean).pop()
    if (last) originalName = decodeURIComponent(last)
  } catch { /* keep the raw URL */ }

  const newImage = {
    id: generateId(),
    boothId: String(body.boothId),
    filename: '',                    // remote — nothing on disk
    originalName,
    path: String(body.url),          // the external URL itself
    displayMode: (body.displayMode ?? 'full') as 'full' | 'split',
    splitCount: typeof body.splitCount === 'number' ? body.splitCount : 2,
    sortOrder: nextOrder,
    customName: body.customName?.trim() || null,
    imageType: (body.imageType ?? 'catalog') as 'catalog' | 'article' | 'receipt',
    personId: body.personId || null,
    parentId: body.parentId || null,
    createdAt: now(),
  }

  db.insert(catalogImages).values(newImage).run()
  return newImage
})
