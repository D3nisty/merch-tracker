import { useDb } from '../../db'
import { catalogImages } from '../../db/schema'
import { eq } from 'drizzle-orm'
import { unlink } from 'node:fs/promises'
import { join } from 'node:path'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const db = useDb()

  const existing = db.select().from(catalogImages).where(eq(catalogImages.id, id)).get()
  if (!existing) throw createError({ statusCode: 404, message: 'Image not found' })

  db.delete(catalogImages).where(eq(catalogImages.id, id)).run()

  // Delete file from disk
  try {
    await unlink(join(process.cwd(), 'public', existing.path.replace(/^\//, '')))
  } catch {}

  return { success: true }
})
