import { useDb } from '../../../db'
import { boothInvites, boothShares, booths, locations, users } from '../../../db/schema'
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
 * Redeem a booth invite token.
 *
 *  - Logged-in caller: just creates (or upgrades) the booth_share, no signup.
 *  - Logged-out caller: body must include `{ username, password }`. We create
 *    the user (role='user'), start a session, then create the booth_share.
 *
 * Mirrors the event-invite accept flow but writes to `booth_shares` instead
 * of `event_shares`. We never downgrade an existing edit-share back to view.
 */
export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token')!
  const db = useDb()

  const invite = db.select().from(boothInvites).where(eq(boothInvites.token, token)).get()
  if (!invite) throw createError({ statusCode: 404, message: 'Invite not found' })
  if (invite.expiresAt && new Date(invite.expiresAt).getTime() < Date.now()) {
    throw createError({ statusCode: 410, message: 'Invite has expired' })
  }

  // Resolve booth + parent event so the response can redirect straight to
  // the booth detail page on success.
  const booth = db.select().from(booths).where(eq(booths.id, invite.boothId)).get()
  if (!booth) throw createError({ statusCode: 404, message: 'Booth no longer exists' })
  const loc = db.select().from(locations).where(eq(locations.id, booth.locationId)).get()

  const body = await readBody(event).catch(() => ({}))
  let user = await getOptionalUser(event)

  if (!user) {
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

    const session = await createSession(user.id)
    setSessionCookie(event, session.id, session.expiresAt)
  }

  // Upsert the share. We never downgrade.
  const existing = db.select().from(boothShares)
    .where(and(eq(boothShares.boothId, invite.boothId), eq(boothShares.userId, user.id))).get()
  if (existing) {
    if (existing.level === 'view' && invite.level === 'edit') {
      db.update(boothShares).set({ level: 'edit' }).where(eq(boothShares.id, existing.id)).run()
    }
  } else {
    db.insert(boothShares).values({
      id: generateId(),
      boothId: invite.boothId,
      userId: user.id,
      level: invite.level,
      createdAt: now(),
    }).run()
  }

  return {
    boothId: invite.boothId,
    boothSlug: booth.slug,
    eventId: loc?.eventId,
    level: invite.level,
    user: { id: user.id, username: user.username, role: user.role },
  }
})
