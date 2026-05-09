<script setup lang="ts">
import { useEventsStore } from '~/stores/events'
import type { Booth, Product } from '~/stores/events'

const route = useRoute()
const store = useEventsStore()

if (!store.currentEvent) {
  await store.fetchEvent(route.params.id as string)
}

const event = computed(() => store.currentEvent)
const booth = computed<Booth | undefined>(() => {
  for (const loc of event.value?.locations ?? []) {
    const found = loc.booths?.find(b => b.id === route.params.boothId)
    if (found) return found
  }
  return undefined
})

if (!booth.value) {
  throw createError({ statusCode: 404, message: 'Booth not found' })
}

const showAddProduct = ref(false)
const showUploadImage = ref(false)
const selectedImageId = ref<string | null>(null)
const showDeleteProductModal = ref(false)
const deleteProductId = ref<string | null>(null)

function confirmDeleteProduct(id: string) {
  deleteProductId.value = id
  showDeleteProductModal.value = true
}

const totalCost = computed(() => {
  return (booth.value?.products ?? []).reduce((sum, p) => sum + (p.price ?? 0) * p.quantity, 0)
})

const purchasedCost = computed(() => {
  return (booth.value?.products ?? []).filter(p => p.isPurchased).reduce((sum, p) => sum + (p.price ?? 0) * p.quantity, 0)
})

async function handleToggle(product: Product) {
  await store.togglePurchased(product)
}

async function handleDeleteProduct() {
  if (!deleteProductId.value) return
  await store.deleteProduct(deleteProductId.value)
  showDeleteProductModal.value = false
  deleteProductId.value = null
}

const groupedByImage = computed(() => {
  const groups: Record<string, Product[]> = { none: [] }
  for (const img of booth.value?.images ?? []) {
    groups[img.id] = []
  }
  for (const p of booth.value?.products ?? []) {
    const key = p.catalogImageId ?? 'none'
    if (!groups[key]) groups[key] = []
    groups[key].push(p)
  }
  return groups
})
</script>

<template>
  <div v-if="booth">
    <!-- Breadcrumb -->
    <div class="mb-6">
      <div class="flex items-center gap-1 text-sm text-gray-400 mb-4">
        <NuxtLink to="/" class="hover:text-white">Events</NuxtLink>
        <UIcon name="i-heroicons-chevron-right" class="w-4 h-4" />
        <NuxtLink :to="`/events/${route.params.id}`" class="hover:text-white">{{ event?.name }}</NuxtLink>
        <UIcon name="i-heroicons-chevron-right" class="w-4 h-4" />
        <span class="text-white">{{ booth.name }}</span>
      </div>

      <div class="flex items-start justify-between">
        <div>
          <h1 class="text-2xl font-bold text-white">{{ booth.name }}</h1>
          <div class="flex items-center gap-3 mt-1 text-gray-400 text-sm">
            <span v-if="booth.hallNr">Hall {{ booth.hallNr }}</span>
            <span v-if="booth.boothNr">Booth {{ booth.boothNr }}</span>
            <a v-if="booth.website" :href="booth.website" target="_blank" class="text-purple-400 hover:underline">
              Website
            </a>
          </div>
          <p v-if="booth.notes" class="text-gray-500 text-sm mt-1">{{ booth.notes }}</p>
        </div>
        <div class="text-right">
          <div class="text-2xl font-bold text-yellow-400">{{ totalCost.toFixed(2) }}€</div>
          <div class="text-sm text-gray-400">{{ purchasedCost.toFixed(2) }}€ spent</div>
        </div>
      </div>
    </div>

    <!-- Action bar -->
    <div class="flex gap-2 mb-6">
      <UButton icon="i-heroicons-plus" color="purple" @click="showAddProduct = true">Add Product</UButton>
      <UButton icon="i-heroicons-photo" variant="outline" color="gray" @click="showUploadImage = true">Upload Catalog</UButton>
    </div>

    <!-- Catalog images with products -->
    <div class="space-y-8">
      <!-- Images with associated products -->
      <div v-for="img in booth.images" :key="img.id">
        <CatalogImageViewer
          :image="img"
          :products="groupedByImage[img.id] ?? []"
          @toggle="handleToggle"
          @add-product="(data) => store.createProduct({ boothId: booth!.id, catalogImageId: img.id, ...data })"
          @delete-product="confirmDeleteProduct($event)"
        />
      </div>

      <!-- Products not linked to any image -->
      <div v-if="(groupedByImage['none'] ?? []).length > 0 || booth.images?.length === 0">
        <h3 class="text-lg font-semibold text-white mb-3">
          {{ booth.images?.length ? 'Other Products' : 'Products' }}
        </h3>
        <div class="space-y-2">
          <ProductItem
            v-for="product in groupedByImage['none']"
            :key="product.id"
            :product="product"
            @toggle="handleToggle(product)"
            @delete="confirmDeleteProduct(product.id)"
          />
        </div>
      </div>

      <!-- Empty state -->
      <div v-if="!booth.products?.length && !booth.images?.length" class="text-center py-12 text-gray-500">
        <UIcon name="i-heroicons-shopping-bag" class="w-12 h-12 mx-auto mb-3 text-gray-600" />
        <p>No products or catalog images yet.</p>
        <p class="text-sm mt-1">Upload a catalog image to extract products, or add them manually.</p>
      </div>
    </div>

    <!-- Modals -->
    <AddProductModal v-model="showAddProduct" :booth-id="booth.id" />
    <UploadCatalogModal v-model="showUploadImage" :booth-id="booth.id" />

    <UModal v-model="showDeleteProductModal" :ui="{ width: 'sm:max-w-sm' }">
      <UCard>
        <template #header><h3 class="font-semibold text-white">Delete Product?</h3></template>
        <p class="text-gray-400 text-sm">This will permanently remove this item from your list.</p>
        <template #footer>
          <div class="flex gap-2 justify-end">
            <UButton variant="ghost" color="gray" @click="showDeleteProductModal = false">Cancel</UButton>
            <UButton color="red" @click="handleDeleteProduct">Delete</UButton>
          </div>
        </template>
      </UCard>
    </UModal>
  </div>
</template>
