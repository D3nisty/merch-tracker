import { useDb } from '../../db'
import { boothDiscounts } from '../../db/schema'
import { eq } from 'drizzle-orm'
import { requireEventEdit, eventIdForDiscount } from '../../utils/permissions'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const db = useDb()

  const eventId = await eventIdForDiscount(id)
  if (!eventId) throw createError({ statusCode: 404, message: 'Discount not found' })
  await requireEventEdit(event, eventId)

  db.delete(boothDiscounts).where(eq(boothDiscounts.id, id)).run()
  return { ok: true }
})
