import { useDb } from '../../../db'
import { eventInvites, eventShares, users } from '../../../db/schema'
import { eq, and } from 'drizzle-orm'
import { generateId, now } from '../../../utils/id'
import {
  getOptionalUser,
  hashPassword,
  createSession,
  setSessionCookie,
  createPersonForUser,
} from '../../../utils/auth'

/**
 * Redeem an invite token.
 *
 *  - Logged-in caller: just creates (or upgrades) the event_share, no signup.
 *  - Logged-out caller: body must include `{ username, password }`. We create
 *    the user (role='user'), start a session, then create the event_share.
 *
 * Idempotent for already-shared users: if a share at the requested level (or
 * better) exists, we keep it. Upgrading view→edit overwrites; we never
 * downgrade an edit-share back to view via this flow.
 */
export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token')!
  const db = useDb()

  const invite = db.select().from(eventInvites).where(eq(eventInvites.token, token)).get()
  if (!invite) throw createError({ statusCode: 404, message: 'Invite not found' })
  if (invite.expiresAt && new Date(invite.expiresAt).getTime() < Date.now()) {
    throw createError({ statusCode: 410, message: 'Invite has expired' })
  }

  const body = await readBody(event).catch(() => ({}))
  let user = await getOptionalUser(event)

  if (!user) {
    // Signup-via-invite flow
    const username = String(body?.username ?? '').trim().toLowerCase()
    const password = String(body?.password ?? '')
    if (!username || username.length < 2) {
      throw createError({ statusCode: 400, message: 'username must be at least 2 characters' })
    }
    if (password.length < 6) {
      throw createError({ statusCode: 400, message: 'password must be at least 6 characters' })
    }
    const taken = db.select({ id: users.id }).from(users).where(eq(users.username, username)).get()
    if (taken) throw createError({ statusCode: 409, message: 'Username already taken' })

    const newUserRow = {
      id: generateId(),
      username,
      passwordHash: hashPassword(password),
      role: 'user' as const,
      createdAt: now(),
    }
    db.insert(users).values(newUserRow).run()
    createPersonForUser(newUserRow.id, newUserRow.username)
    user = newUserRow

    // Auto-login so the redirect target works
    const session = await createSession(user.id)
    setSessionCookie(event, session.id, session.expiresAt)
  }

  // Create or upgrade the share. We never downgrade.
  const existing = db.select().from(eventShares)
    .where(and(eq(eventShares.eventId, invite.eventId), eq(eventShares.userId, user.id))).get()
  if (existing) {
    if (existing.level === 'view' && invite.level === 'edit') {
      db.update(eventShares).set({ level: 'edit' }).where(eq(eventShares.id, existing.id)).run()
    }
  } else {
    db.insert(eventShares).values({
      id: generateId(),
      eventId: invite.eventId,
      userId: user.id,
      level: invite.level,
      createdAt: now(),
    }).run()
  }

  return {
    eventId: invite.eventId,
    level: invite.level,
    user: { id: user.id, username: user.username, role: user.role },
  }
})
