import { useDb } from '../../db'
import { booths } from '../../db/schema'
import { eq } from 'drizzle-orm'
import { requireEventEdit, eventIdForBooth } from '../../utils/permissions'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const db = useDb()

  const existing = db.select().from(booths).where(eq(booths.id, id)).get()
  if (!existing) throw createError({ statusCode: 404, message: 'Booth not found' })

  const eventId = await eventIdForBooth(existing.id)
  if (!eventId) throw createError({ statusCode: 404, message: 'Booth not found' })
  await requireEventEdit(event, eventId)
  const body = await readBody(event)

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
