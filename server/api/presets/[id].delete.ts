import { useDb } from '../../db'
import { boothPricePresets } from '../../db/schema'
import { eq } from 'drizzle-orm'
import { requireEventEdit, eventIdForPreset } from '../../utils/permissions'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!

  const eventId = await eventIdForPreset(id)
  if (!eventId) throw createError({ statusCode: 404, message: 'Preset not found' })
  await requireEventEdit(event, eventId)

  const db = useDb()
  db.delete(boothPricePresets).where(eq(boothPricePresets.id, id)).run()
  return { success: true }
})
