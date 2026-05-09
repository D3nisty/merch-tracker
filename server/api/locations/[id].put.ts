import { useDb } from '../../db'
import { locations } from '../../db/schema'
import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const body = await readBody(event)
  const db = useDb()

  const existing = db.select().from(locations).where(eq(locations.id, id)).get()
  if (!existing) throw createError({ statusCode: 404, message: 'Location not found' })

  const updated = {
    name: body.name ?? existing.name,
    type: body.type ?? existing.type,
    floorPlanImage: body.floorPlanImage !== undefined ? body.floorPlanImage : existing.floorPlanImage,
    layoutData: body.layoutData !== undefined ? body.layoutData : existing.layoutData,
    notes: body.notes !== undefined ? body.notes : existing.notes,
  }

  db.update(locations).set(updated).where(eq(locations.id, id)).run()

  return { ...existing, ...updated }
})
