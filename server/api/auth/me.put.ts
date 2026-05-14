import { useDb } from '../../db'
import { persons } from '../../db/schema'
import { eq } from 'drizzle-orm'
import { requireUser } from '../../utils/auth'

const COLORS = ['purple', 'blue', 'green', 'yellow', 'red', 'pink', 'orange', 'teal'] as const

/**
 * Self-edit endpoint. The user's identity (color and display name) lives on
 * their linked Person row. Username is the login credential and is NOT
 * editable here on purpose — only an admin can rename a user, and even then
 * the username is immutable today.
 *
 * Body: { color?: string, name?: string }
 */
export default defineEventHandler(async (event) => {
  const me = await requireUser(event)
  const body = await readBody(event)

  if (!me.personId) {
    throw createError({ statusCode: 500, message: 'User has no linked person row' })
  }

  const update: { color?: string; name?: string } = {}

  if (body?.color !== undefined) {
    const color = String(body.color)
    if (!COLORS.includes(color as typeof COLORS[number])) {
      throw createError({ statusCode: 400, message: 'Invalid color' })
    }
    update.color = color
  }

  if (body?.name !== undefined) {
    const name = String(body.name).trim()
    if (name.length < 1 || name.length > 60) {
      throw createError({ statusCode: 400, message: 'Display name must be 1–60 characters' })
    }
    update.name = name
  }

  if (Object.keys(update).length === 0) {
    throw createError({ statusCode: 400, message: 'Nothing to update' })
  }

  const db = useDb()
  db.update(persons).set(update).where(eq(persons.id, me.personId)).run()
  return update
})
