import { useDb } from '../../db'
import { boothPricePresets } from '../../db/schema'
import { eq } from 'drizzle-orm'
import { requireBoothEdit } from '../../utils/permissions'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!

  const db = useDb()
  const existing = db.select().from(boothPricePresets).where(eq(boothPricePresets.id, id)).get()
  if (!existing) throw createError({ statusCode: 404, message: 'Preset not found' })
  await requireBoothEdit(event, existing.boothId)

  db.delete(boothPricePresets).where(eq(boothPricePresets.id, id)).run()
  return { success: true }
})
