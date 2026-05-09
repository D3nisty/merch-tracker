<script setup lang="ts">
import { useEventsStore } from '~/stores/events'
import type { Booth } from '~/stores/events'

const route = useRoute()
const store = useEventsStore()

if (!store.currentEvent) {
  await store.fetchEvent(route.params.id as string)
}

const event = computed(() => store.currentEvent)
const selectedLocationId = ref(event.value?.locations?.[0]?.id ?? '')
const selectedLocation = computed(() => event.value?.locations?.find(l => l.id === selectedLocationId.value))
const selectedBoothId = ref<string | null>(null)

const selectedBooth = computed<Booth | undefined>(() =>
  selectedLocation.value?.booths?.find(b => b.id === selectedBoothId.value),
)

// Modals
const showAddBooth = ref(false)
const showHallPlanSetup = ref(false)
const prefillBoothNr = ref('')

function onAddDetectedBooth(boothNr: string) {
  prefillBoothNr.value = boothNr
  showAddBooth.value = true
}

// Stats for selected location
const locationStats = computed(() => {
  const booths = selectedLocation.value?.booths ?? []
  const products = booths.flatMap(b => b.products ?? [])
  const total = products.reduce((s, p) => s + (p.price ?? 0) * p.quantity, 0)
  const spent = products.filter(p => p.isPurchased).reduce((s, p) => s + (p.price ?? 0) * p.quantity, 0)
  return {
    booths: booths.length,
    products: products.length,
    purchased: products.filter(p => p.isPurchased).length,
    total,
    spent,
  }
})
</script>

<template>
  <div v-if="event">
    <!-- Breadcrumb -->
    <div class="flex items-center gap-1 text-sm text-gray-400 mb-6">
      <NuxtLink to="/" class="hover:text-white">Events</NuxtLink>
      <UIcon name="i-heroicons-chevron-right" class="w-4 h-4" />
      <NuxtLink :to="`/events/${route.params.id}`" class="hover:text-white">{{ event.name }}</NuxtLink>
      <UIcon name="i-heroicons-chevron-right" class="w-4 h-4" />
      <span class="text-white">Hall Plan</span>
    </div>

    <div class="flex items-center justify-between mb-4 gap-3 flex-wrap">
      <h1 class="text-2xl font-bold text-white">Hall Plan</h1>
      <div class="flex gap-2">
        <UButton
          v-if="selectedLocation"
          icon="i-heroicons-map"
          color="gray"
          variant="outline"
          size="sm"
          @click="showHallPlanSetup = true"
        >
          Set Up Hall Plan
        </UButton>
        <UButton
          icon="i-heroicons-plus"
          color="purple"
          size="sm"
          @click="showAddBooth = true"
        >
          Add Booth
        </UButton>
      </div>
    </div>

    <!-- Location tabs -->
    <div class="flex gap-2 mb-4 flex-wrap">
      <button
        v-for="loc in event.locations"
        :key="loc.id"
        @click="selectedLocationId = loc.id; selectedBoothId = null"
        :class="[
          'px-4 py-2 rounded-lg text-sm font-medium transition-all border',
          selectedLocationId === loc.id
            ? 'bg-purple-600 border-purple-500 text-white'
            : 'bg-gray-900 border-gray-700 text-gray-400 hover:border-gray-600 hover:text-white',
        ]"
      >
        {{ loc.name }}
        <span class="ml-1.5 text-xs opacity-70">{{ loc.booths?.length ?? 0 }}</span>
      </button>
    </div>

    <!-- Stats bar -->
    <div v-if="selectedLocation" class="grid grid-cols-2 md:grid-cols-5 gap-2 mb-4">
      <div class="bg-gray-900 rounded-lg p-3 text-center">
        <div class="text-lg font-bold text-rose-400">{{ locationStats.booths }}</div>
        <div class="text-xs text-gray-500">Booths</div>
      </div>
      <div class="bg-gray-900 rounded-lg p-3 text-center">
        <div class="text-lg font-bold text-purple-400">{{ locationStats.products }}</div>
        <div class="text-xs text-gray-500">Products</div>
      </div>
      <div class="bg-gray-900 rounded-lg p-3 text-center">
        <div class="text-lg font-bold text-green-400">{{ locationStats.purchased }}/{{ locationStats.products }}</div>
        <div class="text-xs text-gray-500">Purchased</div>
      </div>
      <div class="bg-gray-900 rounded-lg p-3 text-center">
        <div class="text-lg font-bold text-yellow-400">{{ locationStats.total.toFixed(0) }}€</div>
        <div class="text-xs text-gray-500">Budget</div>
      </div>
      <div class="bg-gray-900 rounded-lg p-3 text-center">
        <div class="text-lg font-bold text-blue-400">{{ locationStats.spent.toFixed(0) }}€</div>
        <div class="text-xs text-gray-500">Spent</div>
      </div>
    </div>

    <div class="grid grid-cols-1 xl:grid-cols-4 gap-6">
      <!-- Interactive hall plan (3/4 width on xl) -->
      <div class="xl:col-span-3">
        <HallPlan
          v-if="selectedLocation"
          :location="selectedLocation"
          :selected-booth-id="selectedBoothId"
          @select-booth="selectedBoothId = $event"
          @add-detected-booth="onAddDetectedBooth"
        />
        <div v-else class="bg-gray-900 rounded-xl p-10 text-center text-gray-500">
          No halls found for this event.
        </div>
      </div>

      <!-- Booth detail panel -->
      <div class="xl:col-span-1">
        <div v-if="selectedBooth" class="space-y-3 sticky top-24">
          <UCard>
            <template #header>
              <div class="flex items-center justify-between">
                <div>
                  <h3 class="font-bold text-white text-lg">{{ selectedBooth.name }}</h3>
                  <div class="text-sm text-gray-400 flex gap-2 mt-0.5">
                    <span v-if="selectedBooth.hallNr">Hall {{ selectedBooth.hallNr }}</span>
                    <span v-if="selectedBooth.boothNr" class="font-mono bg-gray-800 px-1.5 rounded text-purple-300">
                      {{ selectedBooth.boothNr }}
                    </span>
                  </div>
                </div>
                <UButton
                  :to="`/events/${route.params.id}/booth/${selectedBooth.id}`"
                  icon="i-heroicons-arrow-top-right-on-square"
                  variant="ghost"
                  size="sm"
                  color="gray"
                />
              </div>
            </template>

            <div class="space-y-2 max-h-80 overflow-y-auto">
              <div
                v-for="product in selectedBooth.products"
                :key="product.id"
                class="flex items-center gap-2 text-sm"
              >
                <UCheckbox
                  :model-value="product.isPurchased"
                  @change="store.togglePurchased(product)"
                />
                <span :class="['flex-1 truncate', product.isPurchased ? 'line-through text-gray-500' : 'text-white']">
                  {{ product.name }}
                </span>
                <span v-if="product.price" class="text-yellow-400 text-xs shrink-0">
                  {{ product.price }}€
                </span>
              </div>
              <p v-if="!selectedBooth.products?.length" class="text-gray-500 text-sm py-2 text-center">
                No products yet
              </p>
            </div>

            <template #footer>
              <div class="space-y-2">
                <div v-if="selectedBooth.products?.length" class="flex justify-between text-xs text-gray-400">
                  <span>Total</span>
                  <span class="text-yellow-400 font-medium">
                    {{ selectedBooth.products.reduce((s, p) => s + (p.price ?? 0) * p.quantity, 0).toFixed(2) }}€
                  </span>
                </div>
                <UButton
                  :to="`/events/${route.params.id}/booth/${selectedBooth.id}`"
                  color="purple"
                  size="sm"
                  block
                  icon="i-heroicons-arrow-right"
                  trailing
                >
                  View Full Details
                </UButton>
              </div>
            </template>
          </UCard>
        </div>

        <div v-else class="bg-gray-900 rounded-xl p-8 text-center text-gray-500 sticky top-24">
          <UIcon name="i-heroicons-cursor-arrow-rays" class="w-10 h-10 mx-auto mb-3 text-gray-600" />
          <p class="font-medium text-sm">Select a booth</p>
          <p class="text-xs mt-1">Click any highlighted booth on the map, or click an outline booth to add it</p>
        </div>
      </div>
    </div>

    <!-- Add booth modal -->
    <AddBoothModal
      v-model="showAddBooth"
      :location-id="selectedLocationId"
      event-type="convention"
      :prefill-booth-nr="prefillBoothNr"
      @close="prefillBoothNr = ''"
    />

    <!-- Hall plan setup modal -->
    <HallPlanSetupModal
      v-if="selectedLocation"
      v-model="showHallPlanSetup"
      :location-id="selectedLocation.id"
      :location-name="selectedLocation.name"
    />
  </div>
</template>
