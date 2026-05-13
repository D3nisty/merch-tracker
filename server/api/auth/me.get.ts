import { getOptionalUser } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  const user = await getOptionalUser(event)
  if (!user) return null
  return { id: user.id, username: user.username, role: user.role }
})
