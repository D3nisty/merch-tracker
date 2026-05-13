import { defineStore } from 'pinia'

export interface Event {
  id: string
  slug: string | null
  name: string
  type: 'convention' | 'travel'
  date: string | null
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
}

export interface AdminUser {
  id: string
  username: string
  role: 'admin' | 'editor' | 'user'
  createdAt: string
}

export interface BasicUser {
  id: string
  username: string
  role: 'admin' | 'editor' | 'user'
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
  createdAt: string
  products?: Product[]
  images?: CatalogImage[]
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

  async function fetchEvents() {
    loading.value = true
    try {
      events.value = await $fetch<Event[]>('/api/events')
    } finally {
      loading.value = false
    }
  }

  async function fetchEvent(id: string) {
    loading.value = true
    try {
      currentEvent.value = await $fetch<Event>(`/api/events/${id}`)
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

  async function togglePurchased(product: Product) {
    return updateProduct(product.id, { isPurchased: !product.isPurchased })
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

  // Article-aware cost helpers:
  // - root article image (no parentId) = 1 item; planned/paid source drives budget
  // - catalog products / unlinked products = each counts individually

  function getItemStats(personId?: string | null): { total: number; purchased: number } {
    if (!currentEvent.value?.locations) return { total: 0, purchased: 0 }
    let total = 0, purchased = 0
    for (const loc of currentEvent.value.locations) {
      for (const booth of loc.booths ?? []) {
        const images = booth.images ?? []
        const products = (booth.products ?? []).filter(p => !personId || p.personId === personId)
        for (const img of images) {
          if (img.imageType !== 'article' || img.parentId) continue
          total++
          if (products.some(p => p.catalogImageId === img.id && p.isPurchased)) purchased++
        }
        for (const p of products) {
          const img = images.find(i => i.id === p.catalogImageId)
          if (img?.imageType === 'article') continue
          total++
          if (p.isPurchased) purchased++
        }
      }
    }
    return { total, purchased }
  }

  // Planned budget: catalog products (all) + article planned/paid source
  function getPlannedCostByCurrency(personId?: string | null): Record<string, number> {
    if (!currentEvent.value?.locations) return {}
    const map: Record<string, number> = {}
    for (const loc of currentEvent.value.locations) {
      for (const booth of loc.booths ?? []) {
        const images = booth.images ?? []
        const products = (booth.products ?? []).filter(p => !personId || p.personId === personId)
        for (const img of images) {
          if (img.imageType !== 'article' || img.parentId) continue
          // Use planned source first, fall back to paid source
          const source = products.find(p => p.catalogImageId === img.id && p.isPlanned)
            ?? products.find(p => p.catalogImageId === img.id && p.isPurchased)
          if (source?.price) {
            const cur = source.currency || 'EUR'
            map[cur] = (map[cur] ?? 0) + source.price * source.quantity
          }
        }
        for (const p of products) {
          const img = images.find(i => i.id === p.catalogImageId)
          if (img?.imageType === 'article') continue
          if (!p.price) continue
          const cur = p.currency || 'EUR'
          map[cur] = (map[cur] ?? 0) + p.price * p.quantity
        }
      }
    }
    return map
  }

  // Paid budget: only isPurchased items (same for both catalog and articles)
  function getPaidCostByCurrency(personId?: string | null): Record<string, number> {
    if (!currentEvent.value?.locations) return {}
    const map: Record<string, number> = {}
    for (const loc of currentEvent.value.locations) {
      for (const booth of loc.booths ?? []) {
        for (const p of (booth.products ?? [])) {
          if (!p.isPurchased || !p.price) continue
          if (personId && p.personId !== personId) continue
          const cur = p.currency || 'EUR'
          map[cur] = (map[cur] ?? 0) + p.price * p.quantity
        }
      }
    }
    return map
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

  async function updateAdminUser(id: string, data: { role?: 'admin' | 'editor' | 'user'; password?: string }) {
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
    createProduct,
    updateProduct,
    deleteProduct,
    togglePurchased,
    updateImage,
    deleteImage,
    uploadSubImage,
    createImageFromUrl,
    replaceImage,
    moveImage,
    getItemStats,
    getPlannedCostByCurrency,
    getPaidCostByCurrency,
    fetchUsers,
    fetchEventShares,
    shareEventWithUser,
    shareEventWithGroup,
    removeShare,
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
