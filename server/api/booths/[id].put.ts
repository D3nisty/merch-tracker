import { useDb } from '../../db'
import { booths } from '../../db/schema'
import { eq } from 'drizzle-orm'
import { requireBoothEdit } from '../../utils/permissions'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const db = useDb()

  const existing = db.select().from(booths).where(eq(booths.id, id)).get()
  if (!existing) throw createError({ statusCode: 404, message: 'Booth not found' })

  // Editing a booth (renaming, repositioning on the map, etc.) is allowed by
  // booth-share users. Deleting the booth still requires event-edit — that
  // gate stays on the DELETE endpoint.
  await requireBoothEdit(event, existing.id)
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
    // iconPath accepts either an external URL or a `/uploads/…` path returned
    // by the booth-icon upload endpoint. Pass `null` to clear.
    iconPath: body.iconPath !== undefined ? body.iconPath : existing.iconPath,
  }

  db.update(booths).set(updated).where(eq(booths.id, id)).run()

  return { ...existing, ...updated }
})
