import { useDb } from '../../db'
import { boothPricePresets } from '../../db/schema'
import { generateId, now } from '../../utils/id'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  if (!body.boothId || !body.label) throw createError({ statusCode: 400, message: 'boothId and label are required' })

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
