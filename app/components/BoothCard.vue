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

const isConv = computed(() => props.eventType === 'convention')

// Filter to the active person (view-as picker → viewer's own person).
const effectivePersonId = computed<string | null>(() =>
  personsStore.currentPersonId
  ?? store.currentEvent?.viewerPersonId
  ?? authStore.user?.personId
  ?? null,
)

const plannedByCurrency = computed(() =>
  store.getBoothPlannedByCurrency(props.booth.id, effectivePersonId.value),
)
// Net paid = gross paid − realised savings (colocated with display per store note).
const paidByCurrency = computed(() => {
  const gross = store.getBoothPaidByCurrency(props.booth.id, effectivePersonId.value)
  const savings = store.getBoothSavingsByCurrency(props.booth.id, effectivePersonId.value)
  const net: Record<string, number> = { ...gross }
  for (const [cur, save] of Object.entries(savings)) net[cur] = (net[cur] ?? 0) - save
  return net
})
const hasPlanned = computed(() => Object.keys(plannedByCurrency.value).some(k => Math.abs(plannedByCurrency.value[k]!) > 0.005))
const hasPaid = computed(() => Object.keys(paidByCurrency.value).some(k => Math.abs(paidByCurrency.value[k]!) > 0.005))
function firstCur(map: Record<string, number>) {
  const e = Object.entries(map).filter(([, v]) => Math.abs(v) > 0.005)[0]
  return e ? { amt: e[1], cur: e[0] } : null
}

const totalCount = computed(() => {
  const images = props.booth.images ?? []
  const articleImageIds = new Set(images.filter(i => i.imageType === 'article').map(i => i.id))
  const nonArticleProductCount = (props.booth.products ?? []).filter(p => !articleImageIds.has(p.catalogImageId ?? '')).length
  return articleImageIds.size + nonArticleProductCount
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

const progress = computed(() => totalCount.value ? Math.round((purchasedCount.value / totalCount.value) * 100) : 0)
</script>

<template>
  <NuxtLink :to="`/events/${route.params.slug}/booth/${booth.slug ?? booth.id}`" class="block h-full">
    <div class="rounded-[13px] bg-surface-2 border border-line p-[13px] h-full transition-colors hover:border-line-focus">
      <!-- header -->
      <div class="flex gap-2.5 mb-2.5">
        <div
          class="shrink-0 w-9 h-9 rounded-[10px] overflow-hidden flex items-center justify-center"
          :class="isConv ? 'cover-conv' : 'cover-travel'"
        >
          <img v-if="booth.iconPath" :src="booth.iconPath" alt="" loading="lazy" decoding="async" class="w-full h-full object-cover" />
          <UIcon v-else name="i-heroicons-shopping-bag" class="w-4 h-4" :class="isConv ? 'text-conv-soft' : 'text-sky-soft'" />
        </div>
        <div class="min-w-0 flex-1">
          <div class="text-[13.5px] font-bold text-ink-strong truncate">{{ booth.name }}</div>
          <div v-if="booth.boothNr || booth.hallNr" class="text-[10px] text-faint mt-0.5">
            <span v-if="booth.hallNr">{{ booth.hallNr }}</span><span v-if="booth.hallNr && booth.boothNr">-</span><span v-if="booth.boothNr">{{ booth.boothNr }}</span>
          </div>
          <div v-if="booth.shopCategory" class="flex flex-wrap gap-1 mt-1">
            <span
              v-for="cat in booth.shopCategory.split(',').slice(0, 2)"
              :key="cat"
              class="text-[9px] text-sky-soft bg-chip-sky px-1.5 py-0.5 rounded-[4px]"
            >{{ cat }}</span>
          </div>
        </div>
      </div>

      <!-- planned / spent mini row (logged-in only) -->
      <div v-if="authStore.isLoggedIn && (hasPlanned || hasPaid)" class="flex justify-between mb-1.5">
        <div>
          <div class="text-[9px] uppercase text-faint">{{ t('booth.planned') }}</div>
          <div class="mono text-[12px] font-semibold text-planned">
            <template v-if="firstCur(plannedByCurrency)">{{ firstCur(plannedByCurrency)!.amt.toFixed(0) }} {{ firstCur(plannedByCurrency)!.cur }}</template>
            <template v-else>—</template>
          </div>
        </div>
        <div class="text-right">
          <div class="text-[9px] uppercase text-faint">{{ t('booth.spent') }}</div>
          <div class="mono text-[12px] font-semibold" :class="hasPaid ? 'text-bought' : 'text-faint'">
            <template v-if="firstCur(paidByCurrency)">{{ firstCur(paidByCurrency)!.amt.toFixed(0) }} {{ firstCur(paidByCurrency)!.cur }}</template>
            <template v-else>—</template>
          </div>
        </div>
      </div>

      <!-- progress -->
      <template v-if="totalCount > 0">
        <div class="flex justify-between text-[10px] text-muted mb-1">
          <span>{{ purchasedCount }}/{{ totalCount }}</span>
          <span>{{ progress }}%</span>
        </div>
        <div class="h-[5px] rounded-full bg-line-soft overflow-hidden">
          <div class="h-full" :class="isConv ? 'grad-progress-conv' : 'grad-progress'" :style="{ width: `${progress}%` }" />
        </div>
      </template>
      <div v-else class="text-[10px] text-faint">{{ t('booth.noProductsYet') }}</div>
    </div>
  </NuxtLink>
</template>
