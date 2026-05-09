import { useDb } from '../../../db'
import { boothPricePresets } from '../../../db/schema'
import { eq } from 'drizzle-orm'

export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id')!
  const db = useDb()
  return db.select().from(boothPricePresets).where(eq(boothPricePresets.boothId, id)).all()
})
