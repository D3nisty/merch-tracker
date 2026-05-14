<script setup lang="ts">
import { useEventsStore } from '~/stores/events'
import { useAuthStore } from '~/stores/auth'
import { usePersonsStore } from '~/stores/persons'
import { useLocale } from '~/composables/useLocale'
import type { Location } from '~/stores/events'
import { formatEventDateRange } from '~/stores/events'

const route = useRoute()
const store = useEventsStore()
const authStore = useAuthStore()
const personsStore = usePersonsStore()
const { t } = useLocale()
await store.fetchEvent(route.params.slug as string)

const event = computed(() => store.currentEvent)

if (!event.value) {
  throw createError({ statusCode: 404, message: 'Event not found' })
}

useHead({ title: () => event.value?.name ?? 'Event' })

const showAddLocation = ref(false)
const showEditEvent = ref(false)
const showShareEvent = ref(false)
const showDeleteLocationModal = ref(false)
const showQrScanner = ref(false)
const deleteLocationId = ref<string | null>(null)

const canShare = computed(() =>
  authStore.isAdmin || event.value?.ownerId === authStore.user?.id,
)

// Totals — filtered by the currently active "view as" person; falls back to
// the viewer's own person so the default landing experience is "my budget,
// my marks" (not the cross-account union). Planned/paid amounts already have
// discount savings subtracted; `savingsEntries` exposes the dollar-value
// saved for the green "− X saved" caption.
const pid = computed(() =>
  personsStore.currentPersonId
  ?? store.currentEvent?.viewerPersonId
  ?? authStore.user?.personId
  ?? null,
)
const itemStats = computed(() => store.getItemStats(pid.value))
const plannedEntries = computed(() => Object.entries(store.getPlannedCostByCurrency(pid.value)).filter(([, v]) => Math.abs(v) > 0.005))
const paidEntries = computed(() => Object.entries(store.getPaidCostByCurrency(pid.value)).filter(([, v]) => Math.abs(v) > 0.005))
const savingsEntries = computed(() => Object.entries(store.getDiscountSavingsByCurrency(pid.value)).filter(([, v]) => Math.abs(v) > 0.005))

async function handleDeleteLocation() {
  if (!deleteLocationId.value) return
  await store.deleteLocation(deleteLocationId.value)
  showDeleteLocationModal.value = false
  deleteLocationId.value = null
}

function confirmDeleteLocation(id: string) {
  deleteLocationId.value = id
  showDeleteLocationModal.value = true
}

function locationIcon(type: Location['type']) {
  const icons: Record<string, string> = {
    hall: 'i-heroicons-building-office',
    city: 'i-heroicons-building-office-2',
    country: 'i-heroicons-globe-alt',
    area: 'i-heroicons-map-pin',
    district: 'i-heroicons-map',
  }
  return icons[type] ?? 'i-heroicons-map-pin'
}
</script>

<template>
  <div v-if="event">
    <!-- Header -->
    <div class="mb-6">
      <NuxtLink to="/" class="text-gray-400 hover:text-white flex items-center gap-1 text-sm mb-4">
        <UIcon name="i-heroicons-arrow-left" class="w-4 h-4" /> {{ t('event.allEvents') }}
      </NuxtLink>

      <div class="flex items-start justify-between gap-3 flex-wrap">
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-3 mb-1 flex-wrap">
            <UBadge
              :label="event.type === 'convention' ? t('events.convention') : t('events.travelType')"
              :color="event.type === 'convention' ? 'purple' : 'blue'"
              variant="soft"
            />
            <span v-if="event.date" class="text-gray-400 text-sm">{{ formatEventDateRange(event.date, event.dateTo) }}</span>
          </div>
          <h1 class="text-2xl sm:text-3xl font-bold text-white break-words">{{ event.name }}</h1>
          <p v-if="event.location" class="text-gray-400 mt-1">{{ event.location }}</p>
          <p v-if="event.description" class="text-gray-500 text-sm mt-2">{{ event.description }}</p>
        </div>
        <div class="flex gap-2 items-start shrink-0 flex-wrap">
          <UBadge
            v-if="event.isPublic"
            :label="t('sharing.public')"
            color="green"
            variant="soft"
            size="xs"
            icon="i-heroicons-globe-alt"
          />
          <UButton
            v-if="canShare"
            icon="i-heroicons-share"
            variant="outline"
            color="purple"
            size="sm"
            @click="showShareEvent = true"
          >
            {{ t('sharing.share') }}
          </UButton>
          <UButton
            v-if="authStore.isEditing"
            icon="i-heroicons-pencil"
            variant="ghost"
            color="gray"
            size="sm"
            @click="showEditEvent = true"
          />
        </div>
      </div>
    </div>

    <!-- Person filter notice -->
    <div v-if="personsStore.currentPerson && authStore.isEditing" class="flex items-center gap-2 mb-3 text-sm text-gray-400">
      <span
        :class="['w-2.5 h-2.5 rounded-full shrink-0', {
          'bg-purple-500': personsStore.currentPerson.color === 'purple',
          'bg-blue-500': personsStore.currentPerson.color === 'blue',
          'bg-green-500': personsStore.currentPerson.color === 'green',
          'bg-yellow-500': personsStore.currentPerson.color === 'yellow',
          'bg-red-500': personsStore.currentPerson.color === 'red',
          'bg-pink-500': personsStore.currentPerson.color === 'pink',
          'bg-orange-500': personsStore.currentPerson.color === 'orange',
          'bg-teal-500': personsStore.currentPerson.color === 'teal',
        }]"
      />
      {{ t('event.showingBudgetFor') }} <span class="text-white font-medium">{{ personsStore.currentPerson.name }}</span>
    </div>

    <!-- Stats bar (paid/spent hidden for guests) -->
    <div :class="['grid grid-cols-2 gap-3 mb-8', authStore.isEditing ? 'md:grid-cols-3 lg:grid-cols-5' : 'md:grid-cols-3']">
      <UCard class="text-center p-4">
        <div class="text-2xl font-bold text-purple-400">{{ event.locations?.length ?? 0 }}</div>
        <div class="text-xs text-gray-400 mt-1">{{ event.type === 'convention' ? t('event.halls') : t('event.locations') }}</div>
      </UCard>
      <UCard class="text-center p-4">
        <div class="text-2xl font-bold text-blue-400">
          {{ event.locations?.reduce((sum, l) => sum + (l.booths?.length ?? 0), 0) ?? 0 }}
        </div>
        <div class="text-xs text-gray-400 mt-1">{{ event.type === 'convention' ? t('event.booths') : t('event.shops') }}</div>
      </UCard>
      <UCard class="text-center p-4">
        <div class="text-2xl font-bold text-green-400">{{ itemStats.purchased }}/{{ itemStats.total }}</div>
        <div class="text-xs text-gray-400 mt-1">{{ t('event.purchased') }}</div>
      </UCard>
      <UCard v-if="authStore.isEditing" class="text-center p-4">
        <div v-if="plannedEntries.length" class="font-bold text-yellow-400 leading-snug">
          <div v-for="[cur, amt] in plannedEntries" :key="cur" class="text-xl">
            {{ amt.toFixed(2) }} {{ cur }}
          </div>
        </div>
        <div v-else class="text-xl font-bold text-yellow-400">—</div>
        <div class="text-xs text-gray-400 mt-1">{{ t('event.plannedBudget') }}</div>
      </UCard>
      <UCard v-if="authStore.isEditing" class="text-center p-4">
        <div v-if="paidEntries.length" class="font-bold text-green-400 leading-snug">
          <div v-for="[cur, amt] in paidEntries" :key="cur" class="text-xl">
            {{ amt.toFixed(2) }} {{ cur }}
          </div>
        </div>
        <div v-else class="text-xl font-bold text-gray-600">—</div>
        <div class="text-xs text-gray-400 mt-1">{{ t('event.paid') }}</div>
        <!-- Realised savings — discounts that have actually kicked in because
             matching items are marked purchased. Lives next to "Spent" since
             that's where the money already moved (forecast savings on planned
             items aren't surfaced anywhere right now). -->
        <div v-if="savingsEntries.length" class="text-xs text-green-400 mt-1">
          <span v-for="([cur, amt], i) in savingsEntries" :key="cur">
            <span v-if="i > 0" class="text-gray-600"> · </span>− {{ amt.toFixed(2) }} {{ cur }}
          </span>
          {{ t('discount.saved') }}
        </div>
      </UCard>
    </div>

    <!-- Locations/Halls -->
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-xl font-bold text-white">
        {{ event.type === 'convention' ? t('event.halls') : t('event.locations') }}
      </h2>
      <UButton v-if="authStore.isEditing" icon="i-heroicons-plus" color="purple" size="sm" @click="showAddLocation = true">
        {{ event.type === 'convention' ? t('event.addHall') : t('event.addLocation') }}
      </UButton>
    </div>

    <div v-if="!event.locations?.length" class="text-center py-10 text-gray-500">
      {{ event.type === 'convention' ? t('event.noHalls') : t('event.noLocations') }}
    </div>

    <div class="space-y-4">
      <LocationCard
        v-for="loc in event.locations"
        :key="loc.id"
        :location="loc"
        :event-type="event.type"
        @delete="confirmDeleteLocation(loc.id)"
      />
    </div>

    <!-- Modals -->
    <AddLocationModal
      v-model="showAddLocation"
      :event-id="event.id"
      :event-type="event.type"
    />

    <EditEventModal
      v-model="showEditEvent"
      :event="event"
    />

    <ShareEventModal
      v-model="showShareEvent"
      :event="event"
    />

    <QrScannerModal
      v-if="event.type === 'convention'"
      v-model="showQrScanner"
      :event-slug="event.slug ?? (route.params.slug as string)"
      :locations="event.locations ?? []"
    />

    <!-- Floating Scan QR button (convention only) -->
    <ClientOnly>
      <button
        v-if="event.type === 'convention'"
        type="button"
        class="fixed bottom-4 left-4 z-40 flex items-center gap-2 px-4 py-3 rounded-full bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-900/40 transition-colors"
        :title="t('qrscan.title')"
        @click="showQrScanner = true"
      >
        <UIcon name="i-heroicons-qr-code" class="w-5 h-5" />
        <span class="hidden sm:inline text-sm font-medium">{{ t('qrscan.scan') }}</span>
      </button>
    </ClientOnly>

    <UModal v-model="showDeleteLocationModal" :ui="{ width: 'sm:max-w-sm' }">
      <UCard>
        <template #header><h3 class="font-semibold text-white">{{ t('event.deleteLocation') }}</h3></template>
        <p class="text-gray-400 text-sm">{{ t('event.deleteLocationDesc') }}</p>
        <template #footer>
          <div class="flex gap-2 justify-end">
            <UButton variant="ghost" color="gray" @click="showDeleteLocationModal = false">{{ t('common.cancel') }}</UButton>
            <UButton color="red" @click="handleDeleteLocation">{{ t('common.delete') }}</UButton>
          </div>
        </template>
      </UCard>
    </UModal>
  </div>
</template>
