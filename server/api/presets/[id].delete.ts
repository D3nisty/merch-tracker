import { useDb } from '../../db'
import { boothPricePresets } from '../../db/schema'
import { eq } from 'drizzle-orm'
import { requireRole } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  await requireRole(event, ['admin', 'editor'])
  const id = getRouterParam(event, 'id')!
  const db = useDb()
  db.delete(boothPricePresets).where(eq(boothPricePresets.id, id)).run()
  return { success: true }
})
