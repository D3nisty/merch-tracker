import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { type H3Event, setCookie, getCookie, createError } from 'h3'
import { useDb } from '../db'
import { sessions, users, type User } from '../db/schema'
import { eq } from 'drizzle-orm'
import { now } from './id'

const SCRYPT_KEYLEN = 64
const SESSION_COOKIE = 'mt_session'
const SESSION_TTL_DAYS = 30

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex')
  return `${salt}:${hash}`
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, expected] = stored.split(':')
  if (!salt || !expected) return false
  const got = scryptSync(password, salt, SCRYPT_KEYLEN)
  const exp = Buffer.from(expected, 'hex')
  if (got.length !== exp.length) return false
  return timingSafeEqual(got, exp)
}

export async function createSession(userId: string): Promise<{ id: string; expiresAt: string }> {
  const db = useDb()
  const id = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString()
  await db.insert(sessions).values({ id, userId, expiresAt, createdAt: now() })
  return { id, expiresAt }
}

export async function destroySession(sessionId: string) {
  const db = useDb()
  await db.delete(sessions).where(eq(sessions.id, sessionId))
}

export async function getSessionUser(sessionId: string): Promise<User | null> {
  const db = useDb()
  const row = await db.select().from(sessions).where(eq(sessions.id, sessionId)).get()
  if (!row) return null
  if (new Date(row.expiresAt).getTime() < Date.now()) {
    await destroySession(sessionId)
    return null
  }
  const user = await db.select().from(users).where(eq(users.id, row.userId)).get()
  // Defensive: a session pointing at a corrupt user record (empty username/role)
  // should be treated as not-logged-in. Kill the session so it stops auto-loading.
  if (!user || !user.username || !user.role) {
    await destroySession(sessionId)
    return null
  }
  return user
}

export function setSessionCookie(event: H3Event, sessionId: string, expiresAt: string) {
  setCookie(event, SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: !import.meta.dev,
    path: '/',
    expires: new Date(expiresAt),
  })
}

export function clearSessionCookie(event: H3Event) {
  // Match every attribute setSessionCookie used; some browsers require sameSite/secure
  // to match for delete to take effect. maxAge 0 + epoch expires forces removal.
  setCookie(event, SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: !import.meta.dev,
    path: '/',
    maxAge: 0,
    expires: new Date(0),
  })
}

export function readSessionCookie(event: H3Event): string | null {
  return getCookie(event, SESSION_COOKIE) ?? null
}

export async function requireUser(event: H3Event): Promise<User> {
  const sid = readSessionCookie(event)
  if (!sid) throw createError({ statusCode: 401, message: 'Not authenticated' })
  const user = await getSessionUser(sid)
  if (!user) throw createError({ statusCode: 401, message: 'Session expired' })
  return user
}

export async function requireRole(event: H3Event, roles: User['role'][]): Promise<User> {
  const user = await requireUser(event)
  if (!roles.includes(user.role)) {
    throw createError({ statusCode: 403, message: 'Forbidden' })
  }
  return user
}

export async function getOptionalUser(event: H3Event): Promise<User | null> {
  const sid = readSessionCookie(event)
  if (!sid) return null
  return getSessionUser(sid)
}
