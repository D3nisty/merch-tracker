<script setup lang="ts">
import type { Booth } from '~/stores/events'
import { useEventsStore } from '~/stores/events'
import { usePersonsStore } from '~/stores/persons'
import { useAuthStore } from '~/stores/auth'
import { useLocale } from '~/composables/useLocale'

const props = defineProps<{
  booth: Booth
  eventType: 'convention' | 'travel'
}>()

const route = useRoute()
const store = useEventsStore()
const personsStore = usePersonsStore()
const authStore = useAuthStore()
const { t } = useLocale()

const COLOR_MAP: Record<string, string> = {
  purple: 'bg-purple-500', blue: 'bg-blue-500', green: 'bg-green-500',
  yellow: 'bg-yellow-500', red: 'bg-red-500', pink: 'bg-pink-500',
  orange: 'bg-orange-500', teal: 'bg-teal-500',
}

const boothPerson = computed(() =>
  props.booth.personId ? personsStore.persons.find(p => p.id === props.booth.personId) ?? null : null,
)

// Filter to the same person the event header uses — view-as picker on /account
// takes priority; otherwise fall back to the viewer's own person. Without a
// filter we'd show the union across all marks and the booth card would look
// inflated for someone who's only personally marked a few items.
const effectivePersonId = computed<string | null>(() =>
  personsStore.currentPersonId
  ?? store.currentEvent?.viewerPersonId
  ?? authStore.user?.personId
  ?? null,
)

const plannedByCurrency = computed(() =>
  store.getBoothPlannedByCurrency(props.booth.id, effectivePersonId.value),
)
const paidByCurrency = computed(() =>
  store.getBoothPaidByCurrency(props.booth.id, effectivePersonId.value),
)
// Hypothetical cost to buy one of everything at this booth — same across
// viewers, doesn't depend on marks. Useful for "is this vendor worth a trip?"
const buyEverythingByCurrency = computed(() =>
  store.getBoothBuyEverythingByCurrency(props.booth.id),
)
const hasPlanned = computed(() => Object.keys(plannedByCurrency.value).some(k => Math.abs(plannedByCurrency.value[k]!) > 0.005))
const hasPaid = computed(() => Object.keys(paidByCurrency.value).some(k => Math.abs(paidByCurrency.value[k]!) > 0.005))
const hasBuyEverything = computed(() => Object.keys(buyEverythingByCurrency.value).some(k => Math.abs(buyEverythingByCurrency.value[k]!) > 0.005))

// Progress reflects the active person's marks too — gross item count
// (articles = 1, non-article products = each one) for total; their purchased
// items for the numerator.
const totalCount = computed(() => {
  const images = props.booth.images ?? []
  const articleImageIds = new Set(images.filter(i => i.imageType === 'article').map(i => i.id))
  const articleImageCount = articleImageIds.size
  const nonArticleProductCount = (props.booth.products ?? []).filter(p => !articleImageIds.has(p.catalogImageId ?? '')).length
  return articleImageCount + nonArticleProductCount
})

function markedPurchasedByPerson(productId: string, personId: string | null): boolean {
  const product = (props.booth.products ?? []).find(p => p.id === productId)
  if (!product) return false
  const marks = product.marks ?? []
  if (!personId) return marks.some(m => m.isPurchased)
  return marks.some(m => m.personId === personId && m.isPurchased)
}

const purchasedCount = computed(() => {
  const pid = effectivePersonId.value
  const images = props.booth.images ?? []
  const products = props.booth.products ?? []
  let count = 0
  for (const img of images) {
    if (img.imageType !== 'article') continue
    if (products.some(p => p.catalogImageId === img.id && markedPurchasedByPerson(p.id, pid))) count++
  }
  for (const p of products) {
    const img = images.find(i => i.id === p.catalogImageId)
    if (img?.imageType === 'article') continue
    if (markedPurchasedByPerson(p.id, pid)) count++
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
              <span v-if="booth.hallNr">{{ t('booth.hallLabel') }} {{ booth.hallNr }}</span>
              <span v-if="booth.hallNr && booth.boothNr"> · </span>
              <span v-if="booth.boothNr">{{ t('booth.boothOf') }} {{ booth.boothNr }}</span>
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
            <div v-if="boothPerson && authStore.isEditing" class="flex items-center gap-1 text-xs text-gray-400">
              <span :class="['w-2 h-2 rounded-full', COLOR_MAP[boothPerson.color] ?? 'bg-purple-500']" />
              {{ boothPerson.name }}
            </div>
            <template v-if="authStore.isLoggedIn">
              <!-- Planned (yellow) — what the viewing person plans to spend
                   at this booth. Gross of any discount; the event header
                   shows the savings line separately. -->
              <div v-if="hasPlanned" class="text-right leading-tight">
                <div class="text-[10px] uppercase tracking-wide text-gray-500">{{ t('booth.planned') }}</div>
                <div class="text-yellow-400 text-xs font-semibold">
                  <div v-for="[cur, amt] in Object.entries(plannedByCurrency)" :key="cur">
                    {{ amt.toFixed(2) }} {{ cur }}
                  </div>
                </div>
              </div>
              <!-- Spent (green) — items the viewing person has marked
                   purchased. Hidden when zero so cards stay compact. -->
              <div v-if="hasPaid" class="text-right leading-tight">
                <div class="text-[10px] uppercase tracking-wide text-gray-500">{{ t('booth.spent') }}</div>
                <div class="text-green-400 text-xs font-semibold">
                  <div v-for="[cur, amt] in Object.entries(paidByCurrency)" :key="cur">
                    {{ amt.toFixed(2) }} {{ cur }}
                  </div>
                </div>
              </div>
              <!-- Hypothetical "buy one of each" total — same for everyone,
                   independent of marks. Dimmed since it's reference data. -->
              <div v-if="hasBuyEverything" class="text-right leading-tight">
                <div class="text-[10px] uppercase tracking-wide text-gray-500">{{ t('booth.buyEverything') }}</div>
                <div class="text-gray-400 text-xs font-medium">
                  <div v-for="[cur, amt] in Object.entries(buyEverythingByCurrency)" :key="cur">
                    {{ amt.toFixed(2) }} {{ cur }}
                  </div>
                </div>
              </div>
            </template>
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

        <div v-if="!totalCount" class="text-xs text-gray-600">{{ t('booth.noProductsYet') }}</div>
      </div>
    </UCard>
  </NuxtLink>
</template>
