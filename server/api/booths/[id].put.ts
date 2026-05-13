import { useDb } from '../../db'
import { booths } from '../../db/schema'
import { eq } from 'drizzle-orm'
import { requireRole } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  await requireRole(event, ['admin', 'editor'])
  const id = getRouterParam(event, 'id')!
  const body = await readBody(event)
  const db = useDb()

  const existing = db.select().from(booths).where(eq(booths.id, id)).get()
  if (!existing) throw createError({ statusCode: 404, message: 'Booth not found' })

  const updated = {
    name: body.name ?? existing.name,
    boothNr: body.boothNr !== undefined ? body.boothNr : existing.boothNr,
    hallNr: body.hallNr !== undefined ? body.hallNr : existing.hallNr,
    mapX: body.mapX !== undefined ? body.mapX : existing.mapX,
    mapY: body.mapY !== undefined ? body.mapY : existing.mapY,
    mapW: body.mapW !== undefined ? body.mapW : existing.mapW,
    mapH: body.mapH !== undefined ? body.mapH : existing.mapH,
    website: body.website !== undefined ? body.website : existing.website,
    notes: body.notes !== undefined ? body.notes : existing.notes,
    shopCategory: body.shopCategory !== undefined ? body.shopCategory : existing.shopCategory,
    personId: body.personId !== undefined ? body.personId : existing.personId,
  }

  db.update(booths).set(updated).where(eq(booths.id, id)).run()

  return { ...existing, ...updated }
})
