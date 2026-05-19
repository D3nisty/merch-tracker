import { defineStore } from 'pinia'

// Format an event's date range for display. Returns:
//   - ''                  if no start date
//   - 'YYYY-MM-DD'        if no end date OR end ≤ start (single day)
//   - 'YYYY-MM-DD – YYYY-MM-DD'  for multi-day ranges
// Kept format-locale-agnostic (raw ISO) to match the rest of the app, which
// renders `event.date` directly.
export function formatEventDateRange(date: string | null | undefined, dateTo: string | null | undefined): string {
  if (!date) return ''
  if (!dateTo || dateTo <= date) return date
  return `${date} – ${dateTo}`
}

export interface Event {
  id: string
  slug: string | null
  name: string
  type: 'convention' | 'travel'
  // `date` is the start day (kept named `date` for backward compat with the
  // single-day schema). `dateTo` is an OPTIONAL end day for multi-day events
  // — when null or equal-to-or-before `date`, the UI renders a single date.
  date: string | null
  dateTo: string | null
  location: string | null
  description: string | null
  isPublic: boolean
  ownerId: string | null
  createdAt: string
  updatedAt: string
  locationCount?: number
  boothCount?: number
  totalProducts?: number
  purchasedProducts?: number
  locations?: Location[]
  // The Person id linked to the requesting user (or null for guests). The
  // server stamps this so the client can route "mark for me" actions without
  // a separate /api/auth/me call.
  viewerPersonId?: string | null
  // True when the viewer can edit the event itself (admin / editor role /
  // owner / direct edit-share). Per-booth edit is exposed via `booth.canEdit`.
  canEdit?: boolean
}

// Per-user share attached to a single booth — read by `ShareBoothModal` to
// list "shared with whom" and by the server to compute `booth.canEdit` for
// the viewer.
export interface BoothUserShare {
  id: string
  level: 'view' | 'edit'
  createdAt: string
  userId: string
  username: string
  name: string | null
  color: string | null
}

// Per-group share — every member of the group inherits the level.
export interface BoothGroupShare {
  id: string
  level: 'view' | 'edit'
  createdAt: string
  groupId: string
  groupName: string
}

// Combined payload returned by `GET /api/booths/[id]/shares` (mirrors
// `EventShares`).
export interface BoothShares {
  users: BoothUserShare[]
  groups: BoothGroupShare[]
}

// Magic-link invite for booth-level access (mirrors `EventInvite`). The
// `token` field is the secret — never log it. ShareBoothModal copies it to
// the user's clipboard as part of the full `/booth-invite/<token>` URL.
export interface BoothInvite {
  id: string
  boothId: string
  token: string
  level: 'view' | 'edit'
  createdBy: string | null
  createdAt: string
  expiresAt: string | null
}

// Server payload for the public booth-invite landing page.
export interface BoothInviteIntrospection {
  level: 'view' | 'edit'
  booth: { id: string; slug: string | null; name: string }
  event: { id: string; slug: string | null; name: string; type: 'convention' | 'travel'; location: string | null }
}

// Per-person planned/purchased mark on a product. Multiple persons can
// independently mark the same product without owning the rectangle.
// `quantity` is per-person ("I'm buying 2 of these"), used by both the booth
// totals and the discount engine — NOT the same field as `products.quantity`
// (that one is a legacy per-product default; marks override it on the UI).
export interface ProductMark {
  personId: string
  isPlanned: boolean
  isPurchased: boolean
  quantity: number
}

// Discount rule attached to a booth, narrowed to products with the given size
// or category. Two shapes: "buy N get M free" (cheapest M in each batch are
// free) and "N for bundle price" (every batch of N is charged a fixed total
// instead of the sum of unit prices).
export interface BoothDiscount {
  id: string
  boothId: string
  label: string
  scopeType: 'size' | 'category'
  scopeValue: string
  type: 'buy_get_free' | 'bundle'
  triggerQty: number
  freeQty: number | null         // used when type='buy_get_free'
  bundlePrice: number | null     // used when type='bundle'
  bundleCurrency: string | null  // used when type='bundle'
  createdAt: string
}

export interface AdminUser {
  id: string
  username: string
  role: 'admin' | 'editor' | 'user'
  personId: string | null
  name: string | null
  color: string | null
  createdAt: string
}

export interface BasicUser {
  id: string
  username: string
  role: 'admin' | 'editor' | 'user'
  name: string | null
  color: string | null
}

export interface Group {
  id: string
  name: string
  ownerId: string | null
  createdAt: string
  memberCount: number
}

export interface GroupMember {
  id: string
  userId: string
  username: string
  role: 'admin' | 'editor' | 'user'
  createdAt: string
}

export interface EventUserShare {
  id: string
  level: 'view' | 'edit'
  createdAt: string
  userId: string
  username: string
  name: string | null
  color: string | null
}

export interface EventGroupShare {
  id: string
  level: 'view' | 'edit'
  createdAt: string
  groupId: string
  groupName: string
}

export interface EventShares {
  users: EventUserShare[]
  groups: EventGroupShare[]
}

export interface EventInvite {
  id: string
  eventId: string
  token: string
  level: 'view' | 'edit'
  createdBy: string | null
  createdAt: string
  expiresAt: string | null
}

export interface InviteIntrospection {
  level: 'view' | 'edit'
  event: { id: string; slug: string | null; name: string; type: 'convention' | 'travel'; location: string | null }
}

export interface DetectedBooth {
  boothNr: string
  x: number
  y: number
  w: number
  h: number
}

export interface HallPlanImage {
  id: string
  path: string
  naturalWidth: number
  naturalHeight: number
  booths: DetectedBooth[]
}

export interface HallLayoutData {
  images: HallPlanImage[]
}

export interface Location {
  id: string
  eventId: string
  name: string
  type: 'hall' | 'city' | 'country' | 'area' | 'district'
  floorPlanImage: string | null
  layoutData: string | null
  notes: string | null
  dateFrom: string | null
  dateTo: string | null
  createdAt: string
  booths?: Booth[]
}

export interface Booth {
  id: string
  slug: string | null
  locationId: string
  name: string
  boothNr: string | null
  hallNr: string | null
  mapX: number | null
  mapY: number | null
  mapW: number | null
  mapH: number | null
  website: string | null
  notes: string | null
  shopCategory: string | null
  personId: string | null
  // Optional booth icon (`/uploads/icon-…` for local upload, or `http(s)://…`
  // for an external URL). Rendered as a small avatar on the dashboard tile
  // and next to the title on the booth detail header.
  iconPath: string | null
  createdAt: string
  products?: Product[]
  images?: CatalogImage[]
  discounts?: BoothDiscount[]
  // Server-stamped per-viewer flag — true when the viewer can edit THIS
  // booth (event-edit OR direct booth-edit-share). Pages should prefer
  // this over `authStore.isEditing` so booth-share users with role='user'
  // still see edit affordances on the booths they're shared on.
  canEdit?: boolean
}

export interface CatalogImage {
  id: string
  boothId: string
  filename: string
  originalName: string
  path: string
  displayMode: 'full' | 'split'
  splitCount: number
  sortOrder: number
  customName: string | null
  imageType: 'catalog' | 'article' | 'receipt'
  personId: string | null
  parentId: string | null
  createdAt: string
}

export interface Product {
  id: string
  boothId: string
  catalogImageId: string | null
  personId: string | null
  ownerId: string | null
  name: string
  description: string | null
  price: number | null
  currency: string
  quantity: number
  size: string | null
  category: string | null
  // Server substitutes these to reflect the REQUESTING USER's per-person mark.
  // (The legacy DB columns now act as ANY-person aggregates internally, but
  // this is the per-viewer perspective the API exposes.)
  isPurchased: boolean
  isPlanned: boolean
  priority: number
  notes: string | null
  website: string | null
  regionX: number | null
  regionY: number | null
  regionW: number | null
  regionH: number | null
  createdAt: string
  updatedAt: string
  // All per-person marks on this product. Includes the requesting user's own
  // mark too, so UIs that want "everyone except me" must filter on personId.
  marks?: ProductMark[]
}

export interface BoothPreset {
  id: string
  boothId: string
  label: string
  price: number
  currency: string
  createdAt: string
}

export const useEventsStore = defineStore('events', () => {
  const events = ref<Event[]>([])
  const currentEvent = ref<Event | null>(null)
  const loading = ref(false)

  // During SSR, internal $fetch does NOT forward the incoming request's
  // cookie automatically — so the API sees no session and treats the call as
  // anonymous. Pass it through explicitly. Without this, `viewerPersonId`
  // resolves to null on first load, every per-person `isPurchased` flag on the
  // event response is false, and checkbox state visually "resets" on refresh
  // (even though the marks are still in the DB).
  function ssrHeaders(): Record<string, string> | undefined {
    if (!import.meta.server) return undefined
    return useRequestHeaders(['cookie'])
  }

  async function fetchEvents() {
    loading.value = true
    try {
      events.value = await $fetch<Event[]>('/api/events', { headers: ssrHeaders() })
    } finally {
      loading.value = false
    }
  }

  async function fetchEvent(id: string) {
    loading.value = true
    try {
      currentEvent.value = await $fetch<Event>(`/api/events/${id}`, { headers: ssrHeaders() })
    } finally {
      loading.value = false
    }
  }

  async function createEvent(data: Partial<Event>) {
    const created = await $fetch<Event>('/api/events', { method: 'POST', body: data })
    events.value.push(created)
    return created
  }

  async function updateEvent(id: string, data: Partial<Event>) {
    const updated = await $fetch<Event>(`/api/events/${id}`, { method: 'PUT', body: data })
    const idx = events.value.findIndex(e => e.id === id)
    if (idx !== -1) events.value[idx] = updated
    if (currentEvent.value?.id === id) currentEvent.value = { ...currentEvent.value, ...updated }
    return updated
  }

  async function deleteEvent(id: string) {
    await $fetch(`/api/events/${id}`, { method: 'DELETE' })
    events.value = events.value.filter(e => e.id !== id)
    if (currentEvent.value?.id === id) currentEvent.value = null
  }

  async function createLocation(data: Partial<Location>) {
    const created = await $fetch<Location>('/api/locations', { method: 'POST', body: data })
    if (currentEvent.value) {
      currentEvent.value.locations = [...(currentEvent.value.locations ?? []), { ...created, booths: [] }]
    }
    return created
  }

  async function updateLocation(id: string, data: Partial<Location>) {
    const updated = await $fetch<Location>(`/api/locations/${id}`, { method: 'PUT', body: data })
    if (currentEvent.value?.locations) {
      const idx = currentEvent.value.locations.findIndex(l => l.id === id)
      if (idx !== -1) currentEvent.value.locations[idx] = { ...currentEvent.value.locations[idx], ...updated }
    }
    return updated
  }

  async function deleteLocation(id: string) {
    await $fetch(`/api/locations/${id}`, { method: 'DELETE' })
    if (currentEvent.value?.locations) {
      currentEvent.value.locations = currentEvent.value.locations.filter(l => l.id !== id)
    }
  }

  async function createBooth(data: Partial<Booth>) {
    const created = await $fetch<Booth>('/api/booths', { method: 'POST', body: data })
    if (currentEvent.value?.locations) {
      const loc = currentEvent.value.locations.find(l => l.id === data.locationId)
      if (loc) loc.booths = [...(loc.booths ?? []), { ...created, products: [], images: [] }]
    }
    return created
  }

  async function updateBooth(id: string, data: Partial<Booth>) {
    const updated = await $fetch<Booth>(`/api/booths/${id}`, { method: 'PUT', body: data })
    if (currentEvent.value?.locations) {
      for (const loc of currentEvent.value.locations) {
        const idx = loc.booths?.findIndex(b => b.id === id) ?? -1
        if (idx !== -1 && loc.booths) loc.booths[idx] = { ...loc.booths[idx], ...updated }
      }
    }
    return updated
  }

  async function deleteBooth(id: string, locationId: string) {
    await $fetch(`/api/booths/${id}`, { method: 'DELETE' })
    if (currentEvent.value?.locations) {
      const loc = currentEvent.value.locations.find(l => l.id === locationId)
      if (loc) loc.booths = loc.booths?.filter(b => b.id !== id)
    }
  }

  // Persist a drag-reordered list of locations. The local store has already
  // been mutated by the v-model on the draggable, so this is fire-and-forget:
  // on failure we refetch the event to recover the canonical order.
  async function reorderLocations(eventIdOrSlug: string, orderedIds: string[]) {
    try {
      await $fetch(`/api/events/${eventIdOrSlug}/reorder-locations`, {
        method: 'POST',
        body: { ids: orderedIds },
      })
    } catch (e) {
      await fetchEvent(eventIdOrSlug)
      throw e
    }
  }

  // Same idea for booths. Caller assembles `groups` from the current event
  // tree post-drag — supports both within-list reorder and cross-list move
  // in one shot.
  async function reorderBooths(
    eventIdOrSlug: string,
    groups: Array<{ locationId: string; boothIds: string[] }>,
  ) {
    try {
      await $fetch(`/api/events/${eventIdOrSlug}/reorder-booths`, {
        method: 'POST',
        body: { groups },
      })
    } catch (e) {
      await fetchEvent(eventIdOrSlug)
      throw e
    }
  }

  // Catalog-image reorder within a booth. Persists the order the user just
  // dragged into; updates the local `sortOrder` field on each image so the
  // `sortedImages` computed reflects it immediately. On failure we refetch
  // the current event to restore the canonical order.
  async function reorderImages(
    boothId: string,
    orderedIds: string[],
    eventIdOrSlug?: string,
  ) {
    if (currentEvent.value?.locations) {
      for (const loc of currentEvent.value.locations) {
        const booth = loc.booths?.find(b => b.id === boothId)
        if (!booth?.images) continue
        const orderMap = new Map(orderedIds.map((id, i) => [id, i]))
        for (const img of booth.images) {
          if (orderMap.has(img.id)) img.sortOrder = orderMap.get(img.id)!
        }
      }
    }
    try {
      await $fetch(`/api/booths/${boothId}/reorder-images`, {
        method: 'POST',
        body: { ids: orderedIds },
      })
    } catch (e) {
      if (eventIdOrSlug) await fetchEvent(eventIdOrSlug)
      throw e
    }
  }

  // Upload an icon image for a booth and stamp the returned URL on the local
  // booth row so the avatar reflects the change immediately. Callers may
  // also pass `iconPath` to `updateBooth` directly for external URLs.
  async function uploadBoothIcon(id: string, file: File): Promise<{ iconPath: string }> {
    const fd = new FormData()
    fd.append('image', file)
    const res = await $fetch<{ iconPath: string }>(`/api/booths/${id}/icon`, { method: 'POST', body: fd })
    if (currentEvent.value?.locations) {
      for (const loc of currentEvent.value.locations) {
        const idx = loc.booths?.findIndex(b => b.id === id) ?? -1
        if (idx !== -1 && loc.booths) loc.booths[idx] = { ...loc.booths[idx], iconPath: res.iconPath }
      }
    }
    return res
  }

  async function createProduct(data: Partial<Product>) {
    const created = await $fetch<Product>('/api/products', { method: 'POST', body: data })
    if (currentEvent.value?.locations) {
      for (const loc of currentEvent.value.locations) {
        const booth = loc.booths?.find(b => b.id === data.boothId)
        if (booth) booth.products = [...(booth.products ?? []), created]
      }
    }
    return created
  }

  async function updateProduct(id: string, data: Partial<Product>) {
    const updated = await $fetch<Product>(`/api/products/${id}`, { method: 'PUT', body: data })
    if (currentEvent.value?.locations) {
      for (const loc of currentEvent.value.locations) {
        for (const booth of loc.booths ?? []) {
          const idx = booth.products?.findIndex(p => p.id === id) ?? -1
          if (idx !== -1 && booth.products) booth.products[idx] = { ...booth.products[idx], ...updated }
        }
      }
    }
    return updated
  }

  async function deleteProduct(id: string) {
    await $fetch(`/api/products/${id}`, { method: 'DELETE' })
    if (currentEvent.value?.locations) {
      for (const loc of currentEvent.value.locations) {
        for (const booth of loc.booths ?? []) {
          booth.products = booth.products?.filter(p => p.id !== id)
        }
      }
    }
  }

  // ── Per-person marks ──────────────────────────────────────────────────
  // Set or update the requesting user's planned/purchased flags on a product.
  // Pass `personId` to mark FOR ANOTHER person (only allowed if you have edit
  // access to the event; otherwise the server 403s). `quantity` is the
  // per-person count (defaults to 1 server-side when omitted on first mark;
  // preserved on subsequent updates unless explicitly overridden).
  async function setMark(productId: string, flags: { isPlanned?: boolean; isPurchased?: boolean; quantity?: number; personId?: string }) {
    const res = await $fetch<{ productId: string; marks: ProductMark[]; aggregate: { isPlanned: boolean; isPurchased: boolean } }>(
      `/api/products/${productId}/marks`,
      { method: 'POST', body: flags },
    )
    if (currentEvent.value?.locations) {
      // Derive the viewer's `isPlanned`/`isPurchased` from the FRESH server
      // response (`res.marks`) instead of trying to predict the delta from
      // `flags`. This is correct in both directions: marking for self (the
      // viewer's mark is in res.marks with the new state) AND marking for
      // someone else (viewer's mark in res.marks is unchanged but kept in
      // sync). Avoids stale-flag bugs when other-person marks arrive.
      const viewerPersonId = currentEvent.value.viewerPersonId ?? null
      for (const loc of currentEvent.value.locations) {
        for (const booth of loc.booths ?? []) {
          const idx = booth.products?.findIndex(p => p.id === productId) ?? -1
          if (idx === -1 || !booth.products) continue
          const myMarkAfter = viewerPersonId
            ? res.marks.find(m => m.personId === viewerPersonId)
            : undefined
          booth.products[idx] = {
            ...booth.products[idx],
            marks: res.marks,
            isPlanned: myMarkAfter?.isPlanned ?? false,
            isPurchased: myMarkAfter?.isPurchased ?? false,
          }
        }
      }
    }
    return res
  }

  // Toggles the requesting user's `isPurchased` mark. Replaces the older
  // single-aggregate flip — multiple people can each have their own state.
  async function togglePurchased(product: Product) {
    return setMark(product.id, { isPurchased: !product.isPurchased })
  }

  // Returns the requesting viewer's own mark on a product, or null.
  function myMark(p: Product): ProductMark | null {
    const pid = currentEvent.value?.viewerPersonId
    if (!pid) return null
    return (p.marks ?? []).find(m => m.personId === pid) ?? null
  }
  // Convenience: how many copies the viewer currently has marked (defaults
  // to 1 when there's a mark with no qty info; 0 if no mark at all).
  function myQty(p: Product): number {
    const m = myMark(p)
    return m ? Math.max(1, m.quantity ?? 1) : 0
  }

  // ── Booth discounts ───────────────────────────────────────────────────
  async function createDiscount(boothId: string, data: Omit<BoothDiscount, 'id' | 'boothId' | 'createdAt'>) {
    const created = await $fetch<BoothDiscount>(`/api/booths/${boothId}/discounts`, { method: 'POST', body: data })
    if (currentEvent.value?.locations) {
      for (const loc of currentEvent.value.locations) {
        const booth = loc.booths?.find(b => b.id === boothId)
        if (booth) booth.discounts = [...(booth.discounts ?? []), created]
      }
    }
    return created
  }

  async function updateDiscount(id: string, data: Partial<BoothDiscount>) {
    const updated = await $fetch<BoothDiscount>(`/api/discounts/${id}`, { method: 'PUT', body: data })
    if (currentEvent.value?.locations) {
      for (const loc of currentEvent.value.locations) {
        for (const booth of loc.booths ?? []) {
          const idx = booth.discounts?.findIndex(d => d.id === id) ?? -1
          if (idx !== -1 && booth.discounts) booth.discounts[idx] = { ...booth.discounts[idx], ...updated }
        }
      }
    }
    return updated
  }

  async function deleteDiscount(id: string) {
    await $fetch(`/api/discounts/${id}`, { method: 'DELETE' })
    if (currentEvent.value?.locations) {
      for (const loc of currentEvent.value.locations) {
        for (const booth of loc.booths ?? []) {
          booth.discounts = booth.discounts?.filter(d => d.id !== id)
        }
      }
    }
  }

  // ── Discount engine ───────────────────────────────────────────────────
  // Given a set of products considered "in play" for a person (e.g. planned
  // or purchased), figure out how much each booth's discounts save. Returns
  // savings keyed by currency.
  //
  // Two discount shapes (per discount.type):
  //
  //   'buy_get_free':
  //     1. Filter units matching the scope AND with price > 0
  //     2. Group by currency (each currency gets its own batches — you can't
  //        mix EUR and USD into one discount group)
  //     3. Sort descending. For every batch of `triggerQty`, the cheapest
  //        `freeQty` items in that batch (end of the sorted-desc slice) are
  //        free — sum their prices into savings for that currency.
  //
  //   'bundle':
  //     1. Filter units matching the scope AND priced in `bundleCurrency`
  //     2. Sort descending. For every batch of `triggerQty`, savings =
  //        max(0, sum(batch) - bundlePrice). Never penalise: if the bundle
  //        price is HIGHER than the cheapest possible batch, the user simply
  //        doesn't take the bundle and we report 0 savings for that batch.
  function applyBoothDiscounts(
    units: Array<{ price: number; currency: string; size: string | null; category: string | null }>,
    discounts: BoothDiscount[],
  ): Record<string, number> {
    const savings: Record<string, number> = {}
    for (const d of discounts) {
      const matchingUnits = units.filter(u => {
        if (!u.price || u.price <= 0) return false
        return d.scopeType === 'size' ? u.size === d.scopeValue : u.category === d.scopeValue
      })
      if (d.type === 'bundle') {
        if (d.bundlePrice == null || !d.bundleCurrency) continue
        const cur = d.bundleCurrency
        const prices = matchingUnits.filter(u => u.currency === cur).map(u => u.price)
        prices.sort((a, b) => b - a)
        const batches = Math.floor(prices.length / d.triggerQty)
        for (let i = 0; i < batches; i++) {
          const slice = prices.slice(i * d.triggerQty, (i + 1) * d.triggerQty)
          const sum = slice.reduce((a, b) => a + b, 0)
          const save = sum - d.bundlePrice
          if (save > 0) savings[cur] = (savings[cur] ?? 0) + save
        }
      } else {
        // buy_get_free. Server validates `1 ≤ freeQty < triggerQty`, but
        // guard defensively in case a corrupt/legacy row slips through —
        // otherwise a negative index would yield NaN savings.
        if (!d.freeQty || d.freeQty < 1 || d.freeQty >= d.triggerQty) continue
        const byCurrency = new Map<string, number[]>()
        for (const u of matchingUnits) {
          if (!byCurrency.has(u.currency)) byCurrency.set(u.currency, [])
          byCurrency.get(u.currency)!.push(u.price)
        }
        for (const [cur, prices] of byCurrency) {
          prices.sort((a, b) => b - a)
          const batches = Math.floor(prices.length / d.triggerQty)
          for (let i = 0; i < batches; i++) {
            const batchEnd = (i + 1) * d.triggerQty
            for (let j = 0; j < d.freeQty; j++) {
              const idx = batchEnd - 1 - j
              const price = prices[idx]
              if (typeof price !== 'number') continue
              savings[cur] = (savings[cur] ?? 0) + price
            }
          }
        }
      }
    }
    return savings
  }

  async function updateImage(id: string, data: Partial<CatalogImage>) {
    const updated = await $fetch<CatalogImage>(`/api/images/${id}`, { method: 'PUT', body: data })
    if (currentEvent.value?.locations) {
      for (const loc of currentEvent.value.locations) {
        for (const booth of loc.booths ?? []) {
          const idx = booth.images?.findIndex(i => i.id === id) ?? -1
          if (idx !== -1 && booth.images) booth.images[idx] = { ...booth.images[idx], ...updated }
        }
      }
    }
    return updated
  }

  async function deleteImage(id: string, boothId: string) {
    await $fetch(`/api/images/${id}`, { method: 'DELETE' })
    if (currentEvent.value?.locations) {
      for (const loc of currentEvent.value.locations) {
        const booth = loc.booths?.find(b => b.id === boothId)
        if (booth) booth.images = booth.images?.filter(i => i.id !== id)
      }
    }
  }

  async function uploadSubImage(boothId: string, parentId: string, file: File, personId?: string) {
    const fd = new FormData()
    fd.append('boothId', boothId)
    fd.append('image', file)
    fd.append('imageType', 'article')
    fd.append('parentId', parentId)
    if (personId) fd.append('personId', personId)
    const created = await $fetch<CatalogImage>('/api/upload/image', { method: 'POST', body: fd })
    if (currentEvent.value?.locations) {
      for (const loc of currentEvent.value.locations) {
        const booth = loc.booths?.find(b => b.id === boothId)
        if (booth) booth.images = [...(booth.images ?? []), created]
      }
    }
    return created
  }

  async function createImageFromUrl(data: {
    boothId: string
    url: string
    customName?: string
    imageType?: 'catalog' | 'article' | 'receipt'
    displayMode?: 'full' | 'split'
    splitCount?: number
    personId?: string
    parentId?: string
  }) {
    const created = await $fetch<CatalogImage>('/api/images/from-url', { method: 'POST', body: data })
    if (currentEvent.value?.locations) {
      for (const loc of currentEvent.value.locations) {
        const booth = loc.booths?.find(b => b.id === data.boothId)
        if (booth) booth.images = [...(booth.images ?? []), created]
      }
    }
    return created
  }

  async function moveImage(id: string, fromBoothId: string, toBoothId: string) {
    await $fetch(`/api/images/${id}/move`, { method: 'POST', body: { boothId: toBoothId } })
    if (!currentEvent.value?.locations) return

    let movedImage: CatalogImage | undefined
    let movedSubImages: CatalogImage[] = []
    let movedProducts: Product[] = []

    for (const loc of currentEvent.value.locations) {
      const fromBooth = loc.booths?.find(b => b.id === fromBoothId)
      if (fromBooth) {
        movedImage = fromBooth.images?.find(i => i.id === id)
        movedSubImages = (fromBooth.images ?? []).filter(i => i.parentId === id)
        movedProducts = (fromBooth.products ?? []).filter(p => p.catalogImageId === id)
        fromBooth.images = (fromBooth.images ?? []).filter(i => i.id !== id && i.parentId !== id)
        fromBooth.products = (fromBooth.products ?? []).filter(p => p.catalogImageId !== id)
        break
      }
    }
    if (!movedImage) return

    for (const loc of currentEvent.value.locations) {
      const toBooth = loc.booths?.find(b => b.id === toBoothId)
      if (toBooth) {
        toBooth.images = [
          ...(toBooth.images ?? []),
          { ...movedImage, boothId: toBoothId },
          ...movedSubImages.map(s => ({ ...s, boothId: toBoothId })),
        ]
        toBooth.products = [
          ...(toBooth.products ?? []),
          ...movedProducts.map(p => ({ ...p, boothId: toBoothId })),
        ]
        break
      }
    }
  }

  async function replaceImage(id: string, boothId: string, file: File) {
    const fd = new FormData()
    fd.append('image', file)
    const updated = await $fetch<CatalogImage>(`/api/images/${id}/replace`, { method: 'POST', body: fd })
    if (currentEvent.value?.locations) {
      for (const loc of currentEvent.value.locations) {
        const booth = loc.booths?.find(b => b.id === boothId)
        if (booth) {
          const idx = booth.images?.findIndex(i => i.id === id) ?? -1
          if (idx !== -1 && booth.images) booth.images[idx] = { ...booth.images[idx], ...updated }
        }
      }
    }
    return updated
  }

  // Per-person mark accessors. If `personId` is null/undefined, we treat it
  // as "anyone has it marked" (the union across all persons).
  function isPlannedFor(p: Product, personId?: string | null): boolean {
    const marks = p.marks ?? []
    if (!personId) return marks.some(m => m.isPlanned)
    return marks.some(m => m.personId === personId && m.isPlanned)
  }
  function isPurchasedFor(p: Product, personId?: string | null): boolean {
    const marks = p.marks ?? []
    if (!personId) return marks.some(m => m.isPurchased)
    return marks.some(m => m.personId === personId && m.isPurchased)
  }

  // Article-aware cost helpers (per-person):
  // - root article image (no parentId) = 1 item; planned/paid source drives budget
  // - catalog products / unlinked products = each counts individually
  // - filtering is by MARK now, not by p.personId (creator). So "Person X's
  //   totals" reflects what X has marked, regardless of who drew the item.

  function getItemStats(personId?: string | null): { total: number; purchased: number } {
    if (!currentEvent.value?.locations) return { total: 0, purchased: 0 }
    let total = 0, purchased = 0
    for (const loc of currentEvent.value.locations) {
      for (const booth of loc.booths ?? []) {
        const images = booth.images ?? []
        // Articles: count via WINNING source per person (mirrors unitsForBooth's
        // rule — "only one source per article counts, planned > paid"). Naive
        // summing across sources double-counts when a person has marks on
        // multiple sources of the same article.
        for (const img of images) {
          if (img.imageType !== 'article' || img.parentId) continue
          const articleProducts = (booth.products ?? []).filter(p => p.catalogImageId === img.id)
          const personIds = personId
            ? [personId]
            : Array.from(new Set(articleProducts.flatMap(p => (p.marks ?? []).map(m => m.personId))))
          if (personIds.length === 0) {
            if (!personId) total++ // unmarked articles still count in the global total
            continue
          }
          for (const pid of personIds) {
            const plannedWinner = articleProducts.find(p => (p.marks ?? []).some(m => m.personId === pid && m.isPlanned))
              ?? articleProducts.find(p => (p.marks ?? []).some(m => m.personId === pid && m.isPurchased))
            if (!plannedWinner) continue
            total += Math.max(1, (plannedWinner.marks ?? []).find(m => m.personId === pid)?.quantity ?? 1)
            const paidWinner = articleProducts.find(p => (p.marks ?? []).some(m => m.personId === pid && m.isPurchased))
            if (paidWinner) {
              purchased += Math.max(1, (paidWinner.marks ?? []).find(m => m.personId === pid)?.quantity ?? 1)
            }
          }
        }
        // Non-article products: each line contributes its per-person qty.
        for (const p of (booth.products ?? [])) {
          const img = images.find(i => i.id === p.catalogImageId)
          if (img?.imageType === 'article') continue
          const pq = matchingQty(p, personId, 'planned')
          if (pq === 0 && personId) continue
          if (pq === 0 && !personId) { total++; continue }
          total += pq
          purchased += matchingQty(p, personId, 'purchased')
        }
      }
    }
    return { total, purchased }
  }

  // For a product, return how many MATCHING units the relevant person(s) have
  // committed to. With a `personId` it's that person's mark quantity (0 if
  // they didn't mark). Without one, it sums across every person who marked
  // the product — that's what the booth header / unfiltered totals show.
  function matchingQty(p: Product, personId: string | null | undefined, pick: 'planned' | 'purchased'): number {
    const marks = p.marks ?? []
    const matches = (m: ProductMark) => pick === 'planned'
      ? (m.isPlanned || m.isPurchased)
      : m.isPurchased
    if (personId) {
      const mine = marks.find(m => m.personId === personId)
      return mine && matches(mine) ? Math.max(1, mine.quantity ?? 1) : 0
    }
    return marks.reduce((sum, m) => sum + (matches(m) ? Math.max(1, m.quantity ?? 1) : 0), 0)
  }

  // Internal: collect priced units for a booth that belong to the given
  // person under the given filter. Each unit becomes one entry the discount
  // engine can group into BOGO/bundle batches.
  function unitsForBooth(
    booth: Booth,
    personId: string | null | undefined,
    pick: 'planned' | 'purchased',
  ): Array<{ price: number; currency: string; size: string | null; category: string | null }> {
    const images = booth.images ?? []
    const out: Array<{ price: number; currency: string; size: string | null; category: string | null }> = []
    for (const p of (booth.products ?? [])) {
      if (!p.price) continue
      // Article gallery: only the WINNING source per person counts. With
      // `personId` it's that person's winner; without, we still cap to a
      // single winning product per article (the first to qualify) to avoid
      // counting every catalogue source for the same article.
      const img = images.find(i => i.id === p.catalogImageId)
      if (img?.imageType === 'article') {
        const articleProducts = (booth.products ?? []).filter(q => q.catalogImageId === img.id && q.price)
        const winner = pick === 'planned'
          ? (articleProducts.find(q => isPlannedFor(q, personId)) ?? articleProducts.find(q => isPurchasedFor(q, personId)))
          : articleProducts.find(q => isPurchasedFor(q, personId))
        if (winner?.id !== p.id) continue
      }
      const qty = matchingQty(p, personId, pick)
      for (let i = 0; i < qty; i++) {
        out.push({ price: p.price, currency: p.currency || 'EUR', size: p.size, category: p.category })
      }
    }
    return out
  }

  function addInto(target: Record<string, number>, source: Record<string, number>) {
    for (const [k, v] of Object.entries(source)) target[k] = (target[k] ?? 0) + v
  }

  // Planned budget — GROSS (no discount applied). The UI shows the gross
  // figure as "Planned Budget" plus a separate "− X saved" caption fed by
  // `getDiscountSavingsByCurrency`, so the user can see both the worst-case
  // cost and the savings the discount engine will realise. To get the
  // net (effective) planned cost, subtract `getDiscountSavingsByCurrency`.
  function getPlannedCostByCurrency(personId?: string | null): Record<string, number> {
    if (!currentEvent.value?.locations) return {}
    const total: Record<string, number> = {}
    for (const loc of currentEvent.value.locations) {
      for (const booth of loc.booths ?? []) {
        const units = unitsForBooth(booth, personId, 'planned')
        for (const u of units) total[u.currency] = (total[u.currency] ?? 0) + u.price
      }
    }
    return total
  }

  // Paid budget — GROSS. Net paid (what the user actually handed over) =
  // this − `getDiscountSavingsByCurrency(personId)`. We keep this gross and
  // do the subtraction in the consumer (event header / booth card) so the
  // math is colocated with the display and Vue's computed-cache reactivity
  // is dependent on both helpers directly (HMR-resistant: even if Pinia's
  // setup-store function bodies don't hot-reload cleanly, the consumer
  // computed will re-subtract on each evaluation).
  function getPaidCostByCurrency(personId?: string | null): Record<string, number> {
    if (!currentEvent.value?.locations) return {}
    const total: Record<string, number> = {}
    for (const loc of currentEvent.value.locations) {
      for (const booth of loc.booths ?? []) {
        const units = unitsForBooth(booth, personId, 'purchased')
        for (const u of units) total[u.currency] = (total[u.currency] ?? 0) + u.price
      }
    }
    return total
  }

  // Per-booth planned/paid GROSS — used by `BoothCard.vue` on the dashboard to
  // show two values per card (planned + spent) filtered to the viewing person.
  function getBoothPlannedByCurrency(boothId: string, personId?: string | null): Record<string, number> {
    if (!currentEvent.value?.locations) return {}
    for (const loc of currentEvent.value.locations) {
      const booth = loc.booths?.find(b => b.id === boothId)
      if (!booth) continue
      const total: Record<string, number> = {}
      const units = unitsForBooth(booth, personId, 'planned')
      for (const u of units) total[u.currency] = (total[u.currency] ?? 0) + u.price
      return total
    }
    return {}
  }
  // GROSS — subtract `getBoothSavingsByCurrency` in the consumer.
  function getBoothPaidByCurrency(boothId: string, personId?: string | null): Record<string, number> {
    if (!currentEvent.value?.locations) return {}
    for (const loc of currentEvent.value.locations) {
      const booth = loc.booths?.find(b => b.id === boothId)
      if (!booth) continue
      const total: Record<string, number> = {}
      const units = unitsForBooth(booth, personId, 'purchased')
      for (const u of units) total[u.currency] = (total[u.currency] ?? 0) + u.price
      return total
    }
    return {}
  }

  // Hypothetical "buy one of everything at this booth" total — independent of
  // any person's marks. For articles (multiple sources for one item) we use
  // the CHEAPEST source's price since you'd realistically buy from one
  // vendor. Catalogue / standalone products each contribute their price once
  // (qty=1, not multiplied by `product.quantity`). Products without a price
  // are skipped.
  function getBoothBuyEverythingByCurrency(boothId: string): Record<string, number> {
    if (!currentEvent.value?.locations) return {}
    for (const loc of currentEvent.value.locations) {
      const booth = loc.booths?.find(b => b.id === boothId)
      if (!booth) continue
      const total: Record<string, number> = {}
      const images = booth.images ?? []
      const claimedArticleSourceIds = new Set<string>()
      for (const img of images) {
        if (img.imageType !== 'article') continue
        const sources = (booth.products ?? []).filter(p => p.catalogImageId === img.id && p.price != null && p.price > 0)
        if (sources.length === 0) continue
        let cheapest = sources[0]!
        for (const s of sources) if ((s.price ?? Infinity) < (cheapest.price ?? Infinity)) cheapest = s
        const cur = cheapest.currency || 'EUR'
        total[cur] = (total[cur] ?? 0) + (cheapest.price ?? 0)
        // Claim every source on this article so the non-article loop below
        // doesn't double-count any of them.
        for (const s of sources) claimedArticleSourceIds.add(s.id)
      }
      for (const p of (booth.products ?? [])) {
        if (!p.price) continue
        if (claimedArticleSourceIds.has(p.id)) continue
        const img = images.find(i => i.id === p.catalogImageId)
        if (img?.imageType === 'article') continue
        const cur = p.currency || 'EUR'
        total[cur] = (total[cur] ?? 0) + p.price
      }
      return total
    }
    return {}
  }

  // REALISED savings — discounts that have actually kicked in because the
  // matching items are marked PURCHASED. Forecast savings (on merely-planned
  // items) aren't shown anywhere right now since the user reads "savings"
  // as "money I've already kept in my pocket", not "money I might save
  // later". If we ever want a forecast view, pass `'planned'` to
  // `unitsForBooth` in a parallel helper.
  function getDiscountSavingsByCurrency(personId?: string | null): Record<string, number> {
    if (!currentEvent.value?.locations) return {}
    const total: Record<string, number> = {}
    for (const loc of currentEvent.value.locations) {
      for (const booth of loc.booths ?? []) {
        const units = unitsForBooth(booth, personId, 'purchased')
        addInto(total, applyBoothDiscounts(units, booth.discounts ?? []))
      }
    }
    return total
  }

  function getBoothSavingsByCurrency(boothId: string, personId?: string | null): Record<string, number> {
    if (!currentEvent.value?.locations) return {}
    for (const loc of currentEvent.value.locations) {
      const booth = loc.booths?.find(b => b.id === boothId)
      if (!booth) continue
      const units = unitsForBooth(booth, personId, 'purchased')
      return applyBoothDiscounts(units, booth.discounts ?? [])
    }
    return {}
  }

  // ── Sharing / groups / admin users ─────────────────────────────────────
  async function fetchUsers(): Promise<BasicUser[]> {
    return await $fetch<BasicUser[]>('/api/users')
  }

  async function fetchEventShares(eventIdOrSlug: string): Promise<EventShares> {
    return await $fetch<EventShares>(`/api/events/${eventIdOrSlug}/shares`)
  }

  async function shareEventWithUser(eventIdOrSlug: string, userId: string, level: 'view' | 'edit') {
    return await $fetch(`/api/events/${eventIdOrSlug}/shares`, {
      method: 'POST',
      body: { userId, level },
    })
  }

  async function shareEventWithGroup(eventIdOrSlug: string, groupId: string, level: 'view' | 'edit') {
    return await $fetch(`/api/events/${eventIdOrSlug}/shares`, {
      method: 'POST',
      body: { groupId, level },
    })
  }

  async function removeShare(eventIdOrSlug: string, shareId: string) {
    return await $fetch(`/api/events/${eventIdOrSlug}/shares/${shareId}`, { method: 'DELETE' })
  }

  // ── Booth shares (per-booth edit grants, layered on top of event shares) ──
  async function fetchBoothShares(boothId: string): Promise<BoothShares> {
    return await $fetch<BoothShares>(`/api/booths/${boothId}/shares`)
  }
  async function shareBoothWithUser(boothId: string, userId: string, level: 'view' | 'edit' = 'edit') {
    return await $fetch(`/api/booths/${boothId}/shares`, {
      method: 'POST',
      body: { userId, level },
    })
  }
  async function shareBoothWithGroup(boothId: string, groupId: string, level: 'view' | 'edit' = 'edit') {
    return await $fetch(`/api/booths/${boothId}/shares`, {
      method: 'POST',
      body: { groupId, level },
    })
  }
  async function removeBoothShare(boothId: string, shareId: string) {
    return await $fetch(`/api/booths/${boothId}/shares/${shareId}`, { method: 'DELETE' })
  }

  // ── Booth invites (magic-link tokens, mirror of event invites) ──────────
  async function fetchBoothInvites(boothId: string): Promise<BoothInvite[]> {
    return await $fetch<BoothInvite[]>(`/api/booths/${boothId}/invites`)
  }
  async function createBoothInvite(boothId: string, level: 'view' | 'edit', expiresInHours?: number): Promise<BoothInvite> {
    return await $fetch<BoothInvite>(`/api/booths/${boothId}/invites`, {
      method: 'POST',
      body: { level, expiresInHours },
    })
  }
  async function revokeBoothInvite(boothId: string, inviteId: string) {
    return await $fetch(`/api/booths/${boothId}/invites/${inviteId}`, { method: 'DELETE' })
  }
  async function introspectBoothInvite(token: string): Promise<BoothInviteIntrospection> {
    return await $fetch<BoothInviteIntrospection>(`/api/booth-invites/${token}`)
  }
  async function acceptBoothInvite(token: string, body?: { username: string; password: string }) {
    return await $fetch<{ boothId: string; boothSlug: string | null; eventId: string | null; level: 'view' | 'edit' }>(
      `/api/booth-invites/${token}/accept`,
      { method: 'POST', body: body ?? {} },
    )
  }

  async function fetchEventInvites(eventIdOrSlug: string): Promise<EventInvite[]> {
    return await $fetch<EventInvite[]>(`/api/events/${eventIdOrSlug}/invites`)
  }

  async function createInvite(eventIdOrSlug: string, level: 'view' | 'edit', expiresInHours?: number): Promise<EventInvite> {
    return await $fetch<EventInvite>(`/api/events/${eventIdOrSlug}/invites`, {
      method: 'POST',
      body: { level, expiresInHours },
    })
  }

  async function revokeInvite(eventIdOrSlug: string, inviteId: string) {
    return await $fetch(`/api/events/${eventIdOrSlug}/invites/${inviteId}`, { method: 'DELETE' })
  }

  async function introspectInvite(token: string): Promise<InviteIntrospection> {
    return await $fetch<InviteIntrospection>(`/api/invites/${token}`)
  }

  async function acceptInvite(token: string, body?: { username?: string; password?: string }) {
    return await $fetch<{ eventId: string; level: 'view' | 'edit'; user: BasicUser }>(`/api/invites/${token}/accept`, {
      method: 'POST',
      body: body ?? {},
    })
  }

  async function fetchGroups(): Promise<Group[]> {
    return await $fetch<Group[]>('/api/groups')
  }

  async function createGroup(name: string): Promise<Group> {
    return await $fetch<Group>('/api/groups', { method: 'POST', body: { name } })
  }

  async function updateGroup(id: string, name: string): Promise<Group> {
    return await $fetch<Group>(`/api/groups/${id}`, { method: 'PUT', body: { name } })
  }

  async function deleteGroup(id: string) {
    return await $fetch(`/api/groups/${id}`, { method: 'DELETE' })
  }

  async function fetchGroupMembers(groupId: string): Promise<GroupMember[]> {
    return await $fetch<GroupMember[]>(`/api/groups/${groupId}/members`)
  }

  async function addGroupMember(groupId: string, userId: string) {
    return await $fetch(`/api/groups/${groupId}/members`, { method: 'POST', body: { userId } })
  }

  async function removeGroupMember(groupId: string, memberId: string) {
    return await $fetch(`/api/groups/${groupId}/members/${memberId}`, { method: 'DELETE' })
  }

  async function fetchAdminUsers(): Promise<AdminUser[]> {
    return await $fetch<AdminUser[]>('/api/admin/users')
  }

  async function createAdminUser(data: { username: string; password: string; role?: 'admin' | 'editor' | 'user' }): Promise<AdminUser> {
    return await $fetch<AdminUser>('/api/admin/users', { method: 'POST', body: data })
  }

  async function updateAdminUser(id: string, data: { role?: 'admin' | 'editor' | 'user'; password?: string; color?: string; name?: string }) {
    return await $fetch(`/api/admin/users/${id}`, { method: 'PUT', body: data })
  }

  async function deleteAdminUser(id: string) {
    return await $fetch(`/api/admin/users/${id}`, { method: 'DELETE' })
  }

  return {
    events,
    currentEvent,
    loading,
    fetchEvents,
    fetchEvent,
    createEvent,
    updateEvent,
    deleteEvent,
    createLocation,
    updateLocation,
    deleteLocation,
    createBooth,
    updateBooth,
    deleteBooth,
    uploadBoothIcon,
    createProduct,
    updateProduct,
    deleteProduct,
    togglePurchased,
    setMark,
    myMark,
    myQty,
    matchingQty,
    isPlannedFor,
    isPurchasedFor,
    createDiscount,
    updateDiscount,
    deleteDiscount,
    getDiscountSavingsByCurrency,
    getBoothSavingsByCurrency,
    getBoothPlannedByCurrency,
    getBoothPaidByCurrency,
    getBoothBuyEverythingByCurrency,
    updateImage,
    deleteImage,
    uploadSubImage,
    createImageFromUrl,
    replaceImage,
    moveImage,
    reorderLocations,
    reorderBooths,
    reorderImages,
    getItemStats,
    getPlannedCostByCurrency,
    getPaidCostByCurrency,
    fetchUsers,
    fetchEventShares,
    shareEventWithUser,
    shareEventWithGroup,
    removeShare,
    fetchBoothShares,
    shareBoothWithUser,
    shareBoothWithGroup,
    removeBoothShare,
    fetchBoothInvites,
    createBoothInvite,
    revokeBoothInvite,
    introspectBoothInvite,
    acceptBoothInvite,
    fetchEventInvites,
    createInvite,
    revokeInvite,
    introspectInvite,
    acceptInvite,
    fetchGroups,
    createGroup,
    updateGroup,
    deleteGroup,
    fetchGroupMembers,
    addGroupMember,
    removeGroupMember,
    fetchAdminUsers,
    createAdminUser,
    updateAdminUser,
    deleteAdminUser,
  }
})
