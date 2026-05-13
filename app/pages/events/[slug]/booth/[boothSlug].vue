<script setup lang="ts">
import { useEventsStore } from '~/stores/events'
import { useAuthStore } from '~/stores/auth'
import { usePersonsStore } from '~/stores/persons'
import { useLocale } from '~/composables/useLocale'
import type { Booth, Product, CatalogImage, BoothPreset } from '~/stores/events'

const route = useRoute()
const store = useEventsStore()
const authStore = useAuthStore()
const personsStore = usePersonsStore()
const { t } = useLocale()

if (!store.currentEvent) {
  await store.fetchEvent(route.params.slug as string)
}

const event = computed(() => store.currentEvent)
const booth = computed<Booth | undefined>(() => {
  const boothSlug = route.params.boothSlug as string
  for (const loc of event.value?.locations ?? []) {
    const found = loc.booths?.find(b => b.slug === boothSlug || b.id === boothSlug)
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

// Price presets
const presets = ref<BoothPreset[]>([])
const showAddPreset = ref(false)
const presetForm = reactive({ label: '', price: '' as string | number, currency: 'EUR' })
const CURRENCIES = ['EUR', 'JPY', 'USD', 'GBP', 'CHF', 'KRW']
const SIZES = ['A6', 'A5', 'A4', 'A3', 'A2', 'B2', 'B3', '90×50cm', '40×23.5cm', '25cm', '20cm', '15cm', '10cm']
const sizeOptions = computed(() => [{ value: '', label: t('booth.pickSize') }, ...SIZES.map(s => ({ value: s, label: s }))])

async function loadPresets() {
  if (!booth.value) return
  presets.value = await $fetch<BoothPreset[]>(`/api/booths/${booth.value.id}/presets`)
}

async function addPreset() {
  if (!presetForm.label.trim() || !presetForm.price || !booth.value) return
  const created = await $fetch<BoothPreset>('/api/presets', {
    method: 'POST',
    body: { boothId: booth.value.id, label: presetForm.label, price: Number(presetForm.price), currency: presetForm.currency },
  })
  presets.value.push(created)
  Object.assign(presetForm, { label: '', price: '', currency: 'EUR' })
  showAddPreset.value = false
}

async function deletePreset(id: string) {
  await $fetch(`/api/presets/${id}`, { method: 'DELETE' })
  presets.value = presets.value.filter(p => p.id !== id)
}

onMounted(loadPresets)

function confirmDeleteProduct(id: string) {
  deleteProductId.value = id
  showDeleteProductModal.value = true
}

function formatCostMap(map: Record<string, number>) {
  const entries = Object.entries(map)
  if (!entries.length) return null
  return entries.map(([cur, amt]) => `${amt.toFixed(2)} ${cur}`).join(' · ')
}

function buildCostMap(products: Product[], images: CatalogImage[], paidOnly: boolean) {
  const map: Record<string, number> = {}
  const countedArticles = new Set<string>()
  for (const p of products) {
    if (!p.price) continue
    if (paidOnly && !p.isPurchased) continue
    const img = images.find(i => i.id === p.catalogImageId)
    if (img?.imageType === 'article') {
      if (paidOnly) {
        if (!p.isPurchased) continue
      } else {
        if (countedArticles.has(img.id)) continue
        if (!p.isPlanned && !p.isPurchased) continue
        countedArticles.add(img.id)
      }
    }
    const cur = p.currency || 'EUR'
    map[cur] = (map[cur] ?? 0) + p.price * p.quantity
  }
  return map
}

const costByCurrency = computed(() =>
  buildCostMap(booth.value?.products ?? [], booth.value?.images ?? [], false))
const purchasedByCurrency = computed(() =>
  buildCostMap(booth.value?.products ?? [], booth.value?.images ?? [], true))

async function handleToggle(product: Product) {
  await store.togglePurchased(product)
}

async function handleDeleteProduct() {
  if (!deleteProductId.value) return
  await store.deleteProduct(deleteProductId.value)
  showDeleteProductModal.value = false
  deleteProductId.value = null
}

const sortedImages = computed(() =>
  [...(booth.value?.images ?? [])]
    .filter(i => !i.parentId)
    .sort((a, b) => a.sortOrder - b.sortOrder),
)

const filteredImages = computed(() => {
  const pid = personsStore.currentPersonId
  if (!pid) return sortedImages.value
  return sortedImages.value.filter(img =>
    img.imageType !== 'article' || !img.personId || img.personId === pid,
  )
})

function subImagesFor(imageId: string) {
  return [...(booth.value?.images ?? [])]
    .filter(i => i.parentId === imageId)
    .sort((a, b) => a.sortOrder - b.sortOrder)
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

async function moveImage(imageId: string, direction: 'up' | 'down') {
  const images = sortedImages.value
  const idx = images.findIndex(i => i.id === imageId)
  if (idx === -1) return
  const swapIdx = direction === 'up' ? idx - 1 : idx + 1
  if (swapIdx < 0 || swapIdx >= images.length) return
  const orders = images.map((_, i) => i * 10)
  const tmp = orders[idx]
  orders[idx] = orders[swapIdx]
  orders[swapIdx] = tmp
  await Promise.all([
    store.updateImage(images[idx].id, { sortOrder: orders[idx] }),
    store.updateImage(images[swapIdx].id, { sortOrder: orders[swapIdx] }),
  ])
}

const COLOR_MAP: Record<string, string> = {
  purple: 'bg-purple-500', blue: 'bg-blue-500', green: 'bg-green-500',
  yellow: 'bg-yellow-500', red: 'bg-red-500', pink: 'bg-pink-500',
  orange: 'bg-orange-500', teal: 'bg-teal-500',
}

const personBreakdown = computed(() => {
  const images = booth.value?.images ?? []
  const result: Array<{ person: typeof personsStore.persons[0] | null; label: string; entries: [string, number][] }> = []
  const personMap = new Map<string | null, Record<string, number>>()

  for (const p of booth.value?.products ?? []) {
    if (!p.price) continue
    const img = images.find(i => i.id === p.catalogImageId)
    if (img?.imageType === 'article' && !p.isPurchased) continue
    const key = p.personId ?? null
    if (!personMap.has(key)) personMap.set(key, {})
    const cur = p.currency || 'EUR'
    personMap.get(key)![cur] = (personMap.get(key)![cur] ?? 0) + p.price * p.quantity
  }

  for (const [personId, map] of personMap) {
    const person = personId ? personsStore.persons.find(p => p.id === personId) ?? null : null
    result.push({
      person,
      label: person?.name ?? t('booth.unassigned'),
      entries: Object.entries(map),
    })
  }
  return result
})
</script>

<template>
  <div v-if="booth">
    <!-- Breadcrumb -->
    <div class="mb-6">
      <div class="flex items-center gap-1 text-sm text-gray-400 mb-4">
        <NuxtLink to="/" class="hover:text-white">Events</NuxtLink>
        <UIcon name="i-heroicons-chevron-right" class="w-4 h-4" />
        <NuxtLink :to="`/events/${route.params.slug}`" class="hover:text-white">{{ event?.name }}</NuxtLink>
        <UIcon name="i-heroicons-chevron-right" class="w-4 h-4" />
        <span class="text-white">{{ booth.name }}</span>
      </div>

      <div class="flex items-start justify-between gap-3 flex-wrap">
        <div class="min-w-0 flex-1">
          <h1 class="text-2xl font-bold text-white break-words">{{ booth.name }}</h1>
          <div class="flex items-center gap-3 mt-1 text-gray-400 text-sm">
            <span v-if="booth.hallNr">Hall {{ booth.hallNr }}</span>
            <span v-if="booth.boothNr">Booth {{ booth.boothNr }}</span>
            <a v-if="booth.website" :href="booth.website" target="_blank" class="text-purple-400 hover:underline">
              Website
            </a>
          </div>
          <p v-if="booth.notes" class="text-gray-500 text-sm mt-1">{{ booth.notes }}</p>
          <div v-if="booth.shopCategory" class="flex flex-wrap gap-1.5 mt-2">
            <span
              v-for="cat in booth.shopCategory.split(',')"
              :key="cat"
              class="px-2 py-0.5 rounded-full text-xs bg-gray-800 text-gray-300 border border-gray-700"
            >
              {{ cat }}
            </span>
          </div>
        </div>
        <div v-if="authStore.isEditing" class="text-right">
          <div v-if="formatCostMap(costByCurrency)" class="font-bold text-yellow-400 leading-tight">
            <div v-for="[cur, amt] in Object.entries(costByCurrency)" :key="cur" class="text-xl">
              {{ amt.toFixed(2) }} {{ cur }}
            </div>
          </div>
          <div v-else class="text-xl font-bold text-yellow-400">—</div>
          <div class="text-sm text-gray-400 mt-0.5">
            {{ formatCostMap(purchasedByCurrency) ?? '0.00' }} {{ t('booth.spent') }}
          </div>
        </div>
      </div>
    </div>

    <!-- Action bar (edit mode only) -->
    <div v-if="authStore.isEditing" class="flex gap-2 mb-6 flex-wrap">
      <UButton icon="i-heroicons-plus" color="purple" @click="showAddProduct = true">{{ t('booth.addProduct') }}</UButton>
      <UButton icon="i-heroicons-photo" variant="outline" color="gray" @click="showUploadImage = true">{{ t('booth.uploadImage') }}</UButton>
    </div>

    <!-- Price presets (edit mode only) -->
    <div v-if="authStore.isEditing" class="mb-6">
      <div class="flex items-center justify-between mb-2">
        <h3 class="text-sm font-semibold text-gray-400">{{ t('booth.pricePresets') }}</h3>
        <UButton
          icon="i-heroicons-plus"
          variant="ghost"
          color="gray"
          size="xs"
          @click="showAddPreset = !showAddPreset"
        >
          {{ t('booth.addPreset') }}
        </UButton>
      </div>

      <div v-if="presets.length" class="flex flex-wrap gap-2 mb-2">
        <div
          v-for="preset in presets"
          :key="preset.id"
          class="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-800 border border-gray-700 text-xs group"
        >
          <span class="text-gray-300">{{ preset.label }}</span>
          <span class="text-yellow-400 font-medium">{{ preset.price.toFixed(2) }} {{ preset.currency }}</span>
          <button
            class="text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
            @click="deletePreset(preset.id)"
          >
            <UIcon name="i-heroicons-x-mark" class="w-3 h-3" />
          </button>
        </div>
      </div>
      <p v-else-if="!showAddPreset" class="text-xs text-gray-600">{{ t('booth.noPresetsHint') }}</p>

      <div v-if="showAddPreset" class="flex gap-2 items-end mt-2">
        <UFormGroup :label="t('booth.size')" class="w-40">
          <USelect
            v-model="presetForm.label"
            :options="sizeOptions"
            option-attribute="label"
            value-attribute="value"
            size="sm"
          />
        </UFormGroup>
        <UFormGroup :label="t('booth.price')" class="w-28">
          <UInput v-model="presetForm.price" type="number" step="0.01" min="0" placeholder="0.00" size="sm" />
        </UFormGroup>
        <UFormGroup :label="t('booth.currency')" class="w-24">
          <USelect
            v-model="presetForm.currency"
            :options="CURRENCIES.map(c => ({ value: c, label: c }))"
            option-attribute="label"
            value-attribute="value"
            size="sm"
          />
        </UFormGroup>
        <UButton color="purple" size="sm" @click="addPreset">{{ t('common.save') }}</UButton>
        <UButton variant="ghost" color="gray" size="sm" @click="showAddPreset = false">{{ t('common.cancel') }}</UButton>
      </div>
    </div>

    <!-- Per-person breakdown -->
    <div v-if="personBreakdown.length > 1" class="mb-6 p-4 rounded-xl bg-gray-900 border border-gray-800">
      <h3 class="text-sm font-semibold text-gray-400 mb-3">{{ t('booth.costByPerson') }}</h3>
      <div class="space-y-2">
        <div v-for="item in personBreakdown" :key="item.label" class="flex items-center justify-between text-sm">
          <div class="flex items-center gap-2">
            <span
              v-if="item.person"
              :class="['w-2.5 h-2.5 rounded-full', COLOR_MAP[item.person.color] ?? 'bg-purple-500']"
            />
            <UIcon v-else name="i-heroicons-user" class="w-3 h-3 text-gray-500" />
            <span class="text-gray-300">{{ item.label }}</span>
          </div>
          <div class="text-yellow-400 font-medium">
            <span v-for="([cur, amt], i) in item.entries" :key="cur">
              <span v-if="i > 0" class="text-gray-600"> · </span>{{ amt.toFixed(2) }} {{ cur }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Catalog images with products -->
    <div :class="['space-y-8', authStore.isEditing && sortedImages.length > 1 ? 'pl-8' : '']">
      <!-- Person filter notice -->
      <div
        v-if="personsStore.currentPersonId && filteredImages.length < sortedImages.length"
        class="flex items-center gap-2 text-xs text-gray-500 pb-2 border-b border-gray-800"
      >
        <UIcon name="i-heroicons-funnel" class="w-3.5 h-3.5" />
        {{ t('booth.showingArticlesFor') }}
        <strong class="text-gray-300">{{ personsStore.persons.find(p => p.id === personsStore.currentPersonId)?.name }}</strong>
        <span class="text-gray-600">({{ sortedImages.length - filteredImages.length }} {{ t('booth.hidden') }})</span>
      </div>

      <div v-for="img in filteredImages" :key="img.id" class="relative group/img">
        <!-- Reorder controls -->
        <div v-if="authStore.isEditing && sortedImages.length > 1" class="absolute -left-8 top-2 flex flex-col gap-0.5 opacity-0 group-hover/img:opacity-100 transition-opacity z-10">
          <button
            :disabled="sortedImages.findIndex(i => i.id === img.id) === 0"
            class="w-6 h-6 flex items-center justify-center rounded bg-gray-800 border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 disabled:opacity-20 disabled:cursor-not-allowed"
            @click="moveImage(img.id, 'up')"
          >
            <UIcon name="i-heroicons-chevron-up" class="w-3.5 h-3.5" />
          </button>
          <button
            :disabled="sortedImages.findIndex(i => i.id === img.id) === sortedImages.length - 1"
            class="w-6 h-6 flex items-center justify-center rounded bg-gray-800 border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 disabled:opacity-20 disabled:cursor-not-allowed"
            @click="moveImage(img.id, 'down')"
          >
            <UIcon name="i-heroicons-chevron-down" class="w-3.5 h-3.5" />
          </button>
        </div>
        <CatalogImageViewer
          :image="img"
          :products="groupedByImage[img.id] ?? []"
          :presets="presets"
          :booth-products="img.imageType === 'receipt' ? booth.products : undefined"
          :sub-images="img.imageType === 'article' ? subImagesFor(img.id) : undefined"
        />
      </div>

      <!-- Products not linked to any image -->
      <div v-if="(groupedByImage['none'] ?? []).length > 0 || booth.images?.length === 0">
        <h3 class="text-lg font-semibold text-white mb-3">
          {{ booth.images?.length ? t('booth.otherProducts') : t('booth.products') }}
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
        <p>{{ t('booth.noContent') }}</p>
        <p v-if="authStore.isEditing" class="text-sm mt-1">{{ t('booth.uploadHint') }}</p>
      </div>
    </div>

    <!-- Modals -->
    <AddProductModal v-model="showAddProduct" :booth-id="booth.id" />
    <UploadCatalogModal v-model="showUploadImage" :booth-id="booth.id" />

    <UModal v-model="showDeleteProductModal" :ui="{ width: 'sm:max-w-sm' }">
      <UCard>
        <template #header><h3 class="font-semibold text-white">{{ t('booth.deleteProduct') }}</h3></template>
        <p class="text-gray-400 text-sm">{{ t('booth.deleteProductDesc') }}</p>
        <template #footer>
          <div class="flex gap-2 justify-end">
            <UButton variant="ghost" color="gray" @click="showDeleteProductModal = false">{{ t('common.cancel') }}</UButton>
            <UButton color="red" @click="handleDeleteProduct">{{ t('common.delete') }}</UButton>
          </div>
        </template>
      </UCard>
    </UModal>
  </div>
</template>
