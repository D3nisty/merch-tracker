import { useDb } from '../../db'
import { products } from '../../db/schema'
import { generateId, now } from '../../utils/id'
import { requireEventEdit, eventIdForBooth } from '../../utils/permissions'
import { requireUser } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  if (!body.boothId || !body.name) {
    throw createError({ statusCode: 400, message: 'boothId and name are required' })
  }

  const eventId = await eventIdForBooth(body.boothId)
  if (!eventId) throw createError({ statusCode: 404, message: 'Booth not found' })
  await requireEventEdit(event, eventId)
  const me = await requireUser(event)

  const db = useDb()
  const id = generateId()
  const ts = now()

  const newProduct = {
    id,
    boothId: body.boothId,
    catalogImageId: body.catalogImageId ?? null,
    personId: body.personId ?? null,
    ownerId: me.id,
    name: body.name,
    description: body.description ?? null,
    price: body.price ?? null,
    currency: body.currency ?? 'EUR',
    quantity: body.quantity ?? 1,
    size: body.size ?? null,
    category: body.category ?? null,
    isPurchased: false,
    priority: body.priority ?? 0,
    notes: body.notes ?? null,
    website: body.website ?? null,
    regionX: body.regionX ?? null,
    regionY: body.regionY ?? null,
    regionW: body.regionW ?? null,
    regionH: body.regionH ?? null,
    createdAt: ts,
    updatedAt: ts,
  }

  db.insert(products).values(newProduct).run()

  return newProduct
})
