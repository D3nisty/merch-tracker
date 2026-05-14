import { useDb } from '../../db'
import { boothDiscounts } from '../../db/schema'
import { eq } from 'drizzle-orm'
import { requireBoothEdit } from '../../utils/permissions'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const db = useDb()

  const existing = db.select().from(boothDiscounts).where(eq(boothDiscounts.id, id)).get()
  if (!existing) throw createError({ statusCode: 404, message: 'Discount not found' })
  await requireBoothEdit(event, existing.boothId)

  db.delete(boothDiscounts).where(eq(boothDiscounts.id, id)).run()
  return { ok: true }
})
