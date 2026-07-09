import type { H3Event } from 'h3'
import { createError } from 'h3'
import { eq, and, inArray } from 'drizzle-orm'
import { useDb } from '../db'
import {
  events,
  locations,
  booths,
  catalogImages,
  products,
  boothPricePresets,
  boothDiscounts,
  boothShares,
  boothGroupShares,
  eventShares,
  eventGroupShares,
  groupMembers,
  type User,
} from '../db/schema'
import { requireUser } from './auth'
import { getAppSetting } from './currency'

/** Whether logged-out (guest) visitors may browse public events. */
function guestBrowsingAllowed(): boolean {
  return getAppSetting('allow_guest', 'true') === 'true'
}

/**
 * Event-level access model
 * ───────────────────────────────────────────────────────────────────────────
 * View (`canViewEvent`):
 *   - admin role
 *   - event.isPublic
 *   - event.ownerId === user.id
 *   - direct user share (any level)
 *   - share via any group the user belongs to (any level)
 *
 * Edit (`canEditEvent`):
 *   - admin role
 *   - editor role (legacy "global editor", treated as admin for content)
 *   - event.ownerId === user.id
 *   - direct user share with level='edit'
 *   - share via any group the user belongs to with level='edit'
 *
 * Nested resources (locations, booths, products, images, presets) inherit from
 * their parent event — `*ForResource` helpers walk up the FK chain to find it.
 */

type EventLike = { id: string; isPublic: boolean; ownerId: string | null }

async function findEvent(eventId: string): Promise<EventLike | null> {
  const db = useDb()
  const row = await db
    .select({ id: events.id, isPublic: events.isPublic, ownerId: events.ownerId })
    .from(events)
    .where(eq(events.id, eventId))
    .get()
  return row ?? null
}

async function userGroupIds(userId: string): Promise<string[]> {
  const db = useDb()
  const rows = await db.select({ groupId: groupMembers.groupId }).from(groupMembers).where(eq(groupMembers.userId, userId)).all()
  return rows.map(r => r.groupId)
}

async function shareLevel(eventId: string, user: User): Promise<'view' | 'edit' | null> {
  const db = useDb()
  const levels: ('view' | 'edit')[] = []

  const direct = await db.select({ level: eventShares.level })
    .from(eventShares)
    .where(and(eq(eventShares.eventId, eventId), eq(eventShares.userId, user.id)))
    .get()
  if (direct) levels.push(direct.level)

  const groupIds = await userGroupIds(user.id)
  if (groupIds.length > 0) {
    const groupRows = await db.select({ level: eventGroupShares.level })
      .from(eventGroupShares)
      .where(and(eq(eventGroupShares.eventId, eventId), inArray(eventGroupShares.groupId, groupIds)))
      .all()
    for (const r of groupRows) levels.push(r.level)
  }

  if (levels.includes('edit')) return 'edit'
  if (levels.includes('view')) return 'view'
  return null
}

export async function canViewEvent(user: User | null, eventId: string): Promise<boolean> {
  const evt = await findEvent(eventId)
  if (!evt) return false
  // Public events are visible to guests only when guest browsing is enabled.
  if (evt.isPublic && (user || guestBrowsingAllowed())) return true
  if (!user) return false
  if (user.role === 'admin') return true
  if (evt.ownerId === user.id) return true
  const level = await shareLevel(eventId, user)
  return level !== null
}

export async function canEditEvent(user: User | null, eventId: string): Promise<boolean> {
  if (!user) return false
  if (user.role === 'admin' || user.role === 'editor') return true
  const evt = await findEvent(eventId)
  if (!evt) return false
  if (evt.ownerId === user.id) return true
  const level = await shareLevel(eventId, user)
  return level === 'edit'
}

export async function requireEventView(event: H3Event, eventId: string): Promise<User | null> {
  const evt = await findEvent(eventId)
  if (!evt) throw createError({ statusCode: 404, message: 'Event not found' })
  if (evt.isPublic) {
    // Guests allowed; return user if logged in
    try { return await requireUser(event) } catch { return null }
  }
  const user = await requireUser(event)
  const ok = await canViewEvent(user, eventId)
  if (!ok) throw createError({ statusCode: 403, message: 'Forbidden' })
  return user
}

export async function requireEventEdit(event: H3Event, eventId: string): Promise<User> {
  const user = await requireUser(event)
  const ok = await canEditEvent(user, eventId)
  if (!ok) throw createError({ statusCode: 403, message: 'Forbidden' })
  return user
}

// Marking a product for a person is a softer permission than editing the
// event: any logged-in user who can VIEW the event may mark a product for
// their own person. This lets view-share collaborators tick "I want this"
// without earning edit rights.
export async function requireEventMark(event: H3Event, eventId: string): Promise<User> {
  const user = await requireUser(event)
  const ok = await canViewEvent(user, eventId)
  if (!ok) throw createError({ statusCode: 403, message: 'Forbidden' })
  return user
}

// ── Booth-level shares ────────────────────────────────────────────────
// Per-booth shares layer ON TOP OF event-level access — they grant extra
// edit rights to a single booth without exposing the rest of the event.
// Use case: at a convention, the event owner invites each artist to manage
// just their own booth. Event-edit users keep their full powers regardless;
// a booth-share user with event-view (or even no event share, if the event
// is public) gains edit rights only on the booths they're explicitly added
// to.

async function boothShareLevel(boothId: string, user: User): Promise<'view' | 'edit' | null> {
  const db = useDb()
  const levels: ('view' | 'edit')[] = []

  const direct = await db.select({ level: boothShares.level })
    .from(boothShares)
    .where(and(eq(boothShares.boothId, boothId), eq(boothShares.userId, user.id)))
    .get()
  if (direct) levels.push(direct.level)

  // Group memberships → booth_group_shares — same union pattern as event-level.
  const groupIds = await userGroupIds(user.id)
  if (groupIds.length > 0) {
    const groupRows = await db.select({ level: boothGroupShares.level })
      .from(boothGroupShares)
      .where(and(eq(boothGroupShares.boothId, boothId), inArray(boothGroupShares.groupId, groupIds)))
      .all()
    for (const r of groupRows) levels.push(r.level)
  }

  if (levels.includes('edit')) return 'edit'
  if (levels.includes('view')) return 'view'
  return null
}

export async function canViewBooth(user: User | null, boothId: string): Promise<boolean> {
  const eventId = await eventIdForBooth(boothId)
  if (!eventId) return false
  if (await canViewEvent(user, eventId)) return true
  if (!user) return false
  return (await boothShareLevel(boothId, user)) !== null
}

export async function canEditBooth(user: User | null, boothId: string): Promise<boolean> {
  if (!user) return false
  const eventId = await eventIdForBooth(boothId)
  if (!eventId) return false
  if (await canEditEvent(user, eventId)) return true
  return (await boothShareLevel(boothId, user)) === 'edit'
}

export async function requireBoothEdit(event: H3Event, boothId: string): Promise<User> {
  const user = await requireUser(event)
  const ok = await canEditBooth(user, boothId)
  if (!ok) throw createError({ statusCode: 403, message: 'Forbidden' })
  return user
}

export async function requireBoothView(event: H3Event, boothId: string): Promise<User | null> {
  const eventId = await eventIdForBooth(boothId)
  if (!eventId) throw createError({ statusCode: 404, message: 'Booth not found' })
  // If the event is public AND the user has no booth share, fall through to
  // requireEventView which allows guests. Otherwise we need a session.
  const evtRow = await useDb().select({ isPublic: events.isPublic }).from(events).where(eq(events.id, eventId)).get()
  if (evtRow?.isPublic) {
    try { return await requireUser(event) } catch { return null }
  }
  const user = await requireUser(event)
  const ok = await canViewBooth(user, boothId)
  if (!ok) throw createError({ statusCode: 403, message: 'Forbidden' })
  return user
}

// Returns the set of booth IDs the user has booth-edit on through either a
// direct user-share OR a group-share they're a member of. (Excludes what
// they can edit via event-level access — that's covered by canEditEvent
// separately.) Used by `GET /api/events/[id]` to stamp a `canEditBooth`
// flag on each booth in the response.
export async function userBoothEditIds(user: User | null): Promise<Set<string>> {
  if (!user) return new Set()
  const db = useDb()
  const direct = await db.select({ boothId: boothShares.boothId })
    .from(boothShares)
    .where(and(eq(boothShares.userId, user.id), eq(boothShares.level, 'edit')))
    .all()
  const ids = new Set(direct.map(r => r.boothId))

  const groupIds = await userGroupIds(user.id)
  if (groupIds.length > 0) {
    const groupRows = await db.select({ boothId: boothGroupShares.boothId })
      .from(boothGroupShares)
      .where(and(inArray(boothGroupShares.groupId, groupIds), eq(boothGroupShares.level, 'edit')))
      .all()
    for (const r of groupRows) ids.add(r.boothId)
  }
  return ids
}

// ── Resource → event lookup helpers ─────────────────────────────────────────
// Each returns the eventId that owns the given resource, or null if the
// resource doesn't exist. Used by mutation endpoints to gate access.

export async function eventIdForLocation(locationId: string): Promise<string | null> {
  const db = useDb()
  const row = await db.select({ eventId: locations.eventId }).from(locations).where(eq(locations.id, locationId)).get()
  return row?.eventId ?? null
}

export async function eventIdForBooth(boothId: string): Promise<string | null> {
  const db = useDb()
  const row = await db
    .select({ eventId: locations.eventId })
    .from(booths)
    .innerJoin(locations, eq(booths.locationId, locations.id))
    .where(eq(booths.id, boothId))
    .get()
  return row?.eventId ?? null
}

export async function eventIdForImage(imageId: string): Promise<string | null> {
  const db = useDb()
  const row = await db
    .select({ eventId: locations.eventId })
    .from(catalogImages)
    .innerJoin(booths, eq(catalogImages.boothId, booths.id))
    .innerJoin(locations, eq(booths.locationId, locations.id))
    .where(eq(catalogImages.id, imageId))
    .get()
  return row?.eventId ?? null
}

export async function eventIdForProduct(productId: string): Promise<string | null> {
  const db = useDb()
  const row = await db
    .select({ eventId: locations.eventId })
    .from(products)
    .innerJoin(booths, eq(products.boothId, booths.id))
    .innerJoin(locations, eq(booths.locationId, locations.id))
    .where(eq(products.id, productId))
    .get()
  return row?.eventId ?? null
}

export async function eventIdForPreset(presetId: string): Promise<string | null> {
  const db = useDb()
  const row = await db
    .select({ eventId: locations.eventId })
    .from(boothPricePresets)
    .innerJoin(booths, eq(boothPricePresets.boothId, booths.id))
    .innerJoin(locations, eq(booths.locationId, locations.id))
    .where(eq(boothPricePresets.id, presetId))
    .get()
  return row?.eventId ?? null
}

export async function eventIdForDiscount(discountId: string): Promise<string | null> {
  const db = useDb()
  const row = await db
    .select({ eventId: locations.eventId })
    .from(boothDiscounts)
    .innerJoin(booths, eq(boothDiscounts.boothId, booths.id))
    .innerJoin(locations, eq(booths.locationId, locations.id))
    .where(eq(boothDiscounts.id, discountId))
    .get()
  return row?.eventId ?? null
}

// ── List filtering ──────────────────────────────────────────────────────────
// Returns the set of event IDs the given user can view. Used by GET /api/events.
// For admins, returns null (meaning "no filter, see all"). For nulls users
// (logged out), returns only public events.

export async function accessibleEventIds(user: User | null): Promise<string[] | null> {
  const db = useDb()
  if (user?.role === 'admin') return null
  // Guests only see public events when guest browsing is enabled.
  if (!user && !guestBrowsingAllowed()) return []
  const publicRows = await db.select({ id: events.id }).from(events).where(eq(events.isPublic, true)).all()
  const ids = new Set<string>(publicRows.map(r => r.id))
  if (!user) return Array.from(ids)
  // Owned
  const ownedRows = await db.select({ id: events.id }).from(events).where(eq(events.ownerId, user.id)).all()
  for (const r of ownedRows) ids.add(r.id)
  // Direct shares
  const directRows = await db.select({ id: eventShares.eventId }).from(eventShares).where(eq(eventShares.userId, user.id)).all()
  for (const r of directRows) ids.add(r.id)
  // Group shares
  const groupIds = await userGroupIds(user.id)
  if (groupIds.length > 0) {
    const groupRows = await db.select({ id: eventGroupShares.eventId }).from(eventGroupShares).where(inArray(eventGroupShares.groupId, groupIds)).all()
    for (const r of groupRows) ids.add(r.id)
  }
  return Array.from(ids)
}
