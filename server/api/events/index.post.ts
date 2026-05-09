import { useDb } from '../../db'
import { events } from '../../db/schema'
import { generateId, now } from '../../utils/id'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  if (!body.name || !body.type) {
    throw createError({ statusCode: 400, message: 'name and type are required' })
  }
  if (!['convention', 'travel'].includes(body.type)) {
    throw createError({ statusCode: 400, message: 'type must be convention or travel' })
  }

  const db = useDb()
  const id = generateId()
  const ts = now()

  const newEvent = {
    id,
    name: body.name,
    type: body.type as 'convention' | 'travel',
    date: body.date ?? null,
    location: body.location ?? null,
    description: body.description ?? null,
    createdAt: ts,
    updatedAt: ts,
  }

  db.insert(events).values(newEvent).run()

  return newEvent
})
