import { readSessionCookie, destroySession, clearSessionCookie } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  const sid = readSessionCookie(event)
  if (sid) await destroySession(sid)
  clearSessionCookie(event)
  return { ok: true }
})
