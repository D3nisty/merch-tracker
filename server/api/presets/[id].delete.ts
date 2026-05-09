import { useDb } from '../../db'
import { boothPricePresets } from '../../db/schema'
import { eq } from 'drizzle-orm'

export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id')!
  const db = useDb()
  db.delete(boothPricePresets).where(eq(boothPricePresets.id, id)).run()
  return { success: true }
})
