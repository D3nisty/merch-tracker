<script setup lang="ts">
import type { Booth, Product, CatalogImage } from '~/stores/events'
import { usePersonsStore } from '~/stores/persons'

const props = defineProps<{
  booth: Booth
  eventType: 'convention' | 'travel'
}>()

const route = useRoute()
const personsStore = usePersonsStore()

const COLOR_MAP: Record<string, string> = {
  purple: 'bg-purple-500', blue: 'bg-blue-500', green: 'bg-green-500',
  yellow: 'bg-yellow-500', red: 'bg-red-500', pink: 'bg-pink-500',
  orange: 'bg-orange-500', teal: 'bg-teal-500',
}

const boothPerson = computed(() =>
  props.booth.personId ? personsStore.persons.find(p => p.id === props.booth.personId) ?? null : null,
)

function isArticleSource(p: Product, images: CatalogImage[]) {
  return images.find(i => i.id === p.catalogImageId)?.imageType === 'article'
}

const costByCurrency = computed(() => {
  const images = props.booth.images ?? []
  const map: Record<string, number> = {}
  for (const p of props.booth.products ?? []) {
    if (!p.price) continue
    if (isArticleSource(p, images) && !p.isPurchased) continue // only count paid article source
    const cur = p.currency || 'EUR'
    map[cur] = (map[cur] ?? 0) + p.price * p.quantity
  }
  return map
})

const hasCost = computed(() => Object.keys(costByCurrency.value).length > 0)

const totalCount = computed(() => {
  const images = props.booth.images ?? []
  const articleImageIds = new Set(images.filter(i => i.imageType === 'article').map(i => i.id))
  const articleImageCount = articleImageIds.size
  const nonArticleProductCount = (props.booth.products ?? []).filter(p => !articleImageIds.has(p.catalogImageId ?? '')).length
  return articleImageCount + nonArticleProductCount
})

const purchasedCount = computed(() => {
  const images = props.booth.images ?? []
  const products = props.booth.products ?? []
  let count = 0
  for (const img of images) {
    if (img.imageType !== 'article') continue
    if (products.some(p => p.catalogImageId === img.id && p.isPurchased)) count++
  }
  for (const p of products) {
    const img = images.find(i => i.id === p.catalogImageId)
    if (img?.imageType === 'article') continue
    if (p.isPurchased) count++
  }
  return count
})

const progress = computed(() => totalCount.value ? (purchasedCount.value / totalCount.value) * 100 : 0)
</script>

<template>
  <NuxtLink :to="`/events/${route.params.slug}/booth/${booth.slug ?? booth.id}`">
    <UCard class="hover:border-purple-500/50 transition-colors cursor-pointer h-full">
      <div class="space-y-2">
        <div class="flex items-start justify-between">
          <div class="flex-1 min-w-0">
            <h4 class="font-semibold text-white text-sm">{{ booth.name }}</h4>
            <div class="text-xs text-gray-500 mt-0.5">
              <span v-if="booth.hallNr">Hall {{ booth.hallNr }}</span>
              <span v-if="booth.hallNr && booth.boothNr"> · </span>
              <span v-if="booth.boothNr">Booth {{ booth.boothNr }}</span>
            </div>
            <div v-if="booth.shopCategory" class="flex flex-wrap gap-1 mt-1.5">
              <span
                v-for="cat in booth.shopCategory.split(',')"
                :key="cat"
                class="px-1.5 py-0.5 rounded text-xs bg-gray-800 text-gray-300 border border-gray-700"
              >
                {{ cat }}
              </span>
            </div>
          </div>
          <div class="flex flex-col items-end gap-1 shrink-0">
            <div v-if="boothPerson" class="flex items-center gap-1 text-xs text-gray-400">
              <span :class="['w-2 h-2 rounded-full', COLOR_MAP[boothPerson.color] ?? 'bg-purple-500']" />
              {{ boothPerson.name }}
            </div>
            <div v-if="hasCost" class="text-yellow-400 text-xs font-semibold text-right leading-tight">
              <div v-for="[cur, amt] in Object.entries(costByCurrency)" :key="cur">
                {{ amt.toFixed(2) }} {{ cur }}
              </div>
            </div>
          </div>
        </div>

        <!-- Progress bar -->
        <div v-if="totalCount > 0">
          <div class="flex justify-between text-xs text-gray-400 mb-1">
            <span>{{ purchasedCount }}/{{ totalCount }}</span>
            <span>{{ Math.round(progress) }}%</span>
          </div>
          <div class="h-1 bg-gray-800 rounded-full overflow-hidden">
            <div
              class="h-full bg-gradient-to-r from-purple-500 to-green-500 rounded-full transition-all"
              :style="{ width: `${progress}%` }"
            />
          </div>
        </div>

        <div v-if="!totalCount" class="text-xs text-gray-600">No products yet</div>
      </div>
    </UCard>
  </NuxtLink>
</template>
