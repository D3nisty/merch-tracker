import { useDb } from '../../db'
import { persons } from '../../db/schema'
import { generateId, now } from '../../utils/id'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  if (!body.name?.trim()) throw createError({ statusCode: 400, message: 'name is required' })

  const db = useDb()
  const person = {
    id: generateId(),
    name: body.name.trim(),
    color: body.color ?? 'purple',
    createdAt: now(),
  }
  db.insert(persons).values(person).run()
  return person
})
