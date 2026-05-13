import { useDb } from '../../db'
import { boothPricePresets } from '../../db/schema'
import { generateId, now } from '../../utils/id'
import { requireEventEdit, eventIdForBooth } from '../../utils/permissions'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  if (!body.boothId || !body.label) throw createError({ statusCode: 400, message: 'boothId and label are required' })

  const eventId = await eventIdForBooth(String(body.boothId))
  if (!eventId) throw createError({ statusCode: 404, message: 'Booth not found' })
  await requireEventEdit(event, eventId)

  const db = useDb()
  const preset = {
    id: generateId(),
    boothId: body.boothId,
    label: body.label,
    price: Number(body.price) || 0,
    currency: body.currency ?? 'EUR',
    createdAt: now(),
  }
  db.insert(boothPricePresets).values(preset).run()
  return preset
})
