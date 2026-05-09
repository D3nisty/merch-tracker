<script setup lang="ts">
import type { Booth } from '~/stores/events'

const props = defineProps<{
  booth: Booth
  eventType: 'convention' | 'travel'
}>()

const route = useRoute()

const totalCost = computed(() =>
  (props.booth.products ?? []).reduce((sum, p) => sum + (p.price ?? 0) * p.quantity, 0),
)
const purchasedCount = computed(() => (props.booth.products ?? []).filter(p => p.isPurchased).length)
const totalCount = computed(() => props.booth.products?.length ?? 0)
const progress = computed(() => totalCount.value ? (purchasedCount.value / totalCount.value) * 100 : 0)
</script>

<template>
  <NuxtLink :to="`/events/${route.params.id}/booth/${booth.id}`">
    <UCard class="hover:border-purple-500/50 transition-colors cursor-pointer h-full">
      <div class="space-y-2">
        <div class="flex items-start justify-between">
          <div>
            <h4 class="font-semibold text-white text-sm">{{ booth.name }}</h4>
            <div class="text-xs text-gray-500 mt-0.5">
              <span v-if="booth.hallNr">Hall {{ booth.hallNr }}</span>
              <span v-if="booth.hallNr && booth.boothNr"> · </span>
              <span v-if="booth.boothNr">Booth {{ booth.boothNr }}</span>
            </div>
          </div>
          <span v-if="totalCost > 0" class="text-yellow-400 text-xs font-semibold">
            {{ totalCost.toFixed(2) }}€
          </span>
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
