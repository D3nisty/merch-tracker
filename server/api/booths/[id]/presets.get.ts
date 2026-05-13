import { useDb } from '../../../db'
import { boothPricePresets } from '../../../db/schema'
import { eq } from 'drizzle-orm'
import { requireEventView, eventIdForBooth } from '../../../utils/permissions'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!

  const eventId = await eventIdForBooth(id)
  if (!eventId) throw createError({ statusCode: 404, message: 'Booth not found' })
  await requireEventView(event, eventId)

  const db = useDb()
  return db.select().from(boothPricePresets).where(eq(boothPricePresets.boothId, id)).all()
})
