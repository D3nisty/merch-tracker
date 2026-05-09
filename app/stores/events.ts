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
  createdAt: string
}

export interface Product {
  id: string
  boothId: string
  catalogImageId: string | null
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
  regionX: number | null
  regionY: number | null
  regionW: number | null
  regionH: number | null
  createdAt: string
  updatedAt: string
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

  function getTotalCost(boothId?: string): number {
    if (!currentEvent.value?.locations) return 0
    let total = 0
    for (const loc of currentEvent.value.locations) {
      for (const booth of loc.booths ?? []) {
        if (boothId && booth.id !== boothId) continue
        for (const product of booth.products ?? []) {
          if (product.price) total += product.price * product.quantity
        }
      }
    }
    return total
  }

  function getPurchasedCost(boothId?: string): number {
    if (!currentEvent.value?.locations) return 0
    let total = 0
    for (const loc of currentEvent.value.locations) {
      for (const booth of loc.booths ?? []) {
        if (boothId && booth.id !== boothId) continue
        for (const product of booth.products ?? []) {
          if (product.price && product.isPurchased) total += product.price * product.quantity
        }
      }
    }
    return total
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
    getTotalCost,
    getPurchasedCost,
  }
})
