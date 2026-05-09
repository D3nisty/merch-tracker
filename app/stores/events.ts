import { defineStore } from 'pinia'

export interface Event {
  id: string
  name: string
  type: 'convention' | 'travel'
  date: string | null
  location: string | null
  description: string | null
  createdAt: string
  updatedAt: string
  locations?: Location[]
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
  createdAt: string
}

export interface Product {
  id: string
  boothId: string
  catalogImageId: string | null
  personId: string | null
  name: string
  description: string | null
  price: number | null
  currency: string
  quantity: number
  size: string | null
  category: string | null
  isPurchased: boolean
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

  // Article-aware cost helpers:
  // - article image = 1 item; only the paid source counts toward budget
  // - catalog products / unlinked products = each counts individually

  function getItemStats(personId?: string | null): { total: number; purchased: number } {
    if (!currentEvent.value?.locations) return { total: 0, purchased: 0 }
    let total = 0, purchased = 0
    for (const loc of currentEvent.value.locations) {
      for (const booth of loc.booths ?? []) {
        const images = booth.images ?? []
        const products = (booth.products ?? []).filter(p => !personId || p.personId === personId)
        for (const img of images) {
          if (img.imageType !== 'article') continue
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

  // Planned budget: catalog products (all) + article paid sources only
  function getPlannedCostByCurrency(personId?: string | null): Record<string, number> {
    if (!currentEvent.value?.locations) return {}
    const map: Record<string, number> = {}
    for (const loc of currentEvent.value.locations) {
      for (const booth of loc.booths ?? []) {
        const images = booth.images ?? []
        const products = (booth.products ?? []).filter(p => !personId || p.personId === personId)
        for (const img of images) {
          if (img.imageType !== 'article') continue
          const paid = products.find(p => p.catalogImageId === img.id && p.isPurchased)
          if (paid?.price) {
            const cur = paid.currency || 'EUR'
            map[cur] = (map[cur] ?? 0) + paid.price * paid.quantity
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

  // Keep old names pointing to article-aware versions for backwards compat
  function getTotalCostByCurrency() { return getPlannedCostByCurrency() }
  function getPurchasedCostByCurrency() { return getPaidCostByCurrency() }

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
    getItemStats,
    getPlannedCostByCurrency,
    getPaidCostByCurrency,
    getTotalCostByCurrency,
    getPurchasedCostByCurrency,
  }
})
