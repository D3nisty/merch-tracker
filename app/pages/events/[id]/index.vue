<script setup lang="ts">
import { useEventsStore } from '~/stores/events'
import { useAuthStore } from '~/stores/auth'
import { usePersonsStore } from '~/stores/persons'
import type { Location } from '~/stores/events'

const route = useRoute()
const store = useEventsStore()
const authStore = useAuthStore()
const personsStore = usePersonsStore()
await store.fetchEvent(route.params.id as string)

const event = computed(() => store.currentEvent)

if (!event.value) {
  throw createError({ statusCode: 404, message: 'Event not found' })
}

const showAddLocation = ref(false)
const showEditEvent = ref(false)
const showDeleteLocationModal = ref(false)
const deleteLocationId = ref<string | null>(null)

// Totals — article-aware, filtered by selected person
const pid = computed(() => personsStore.currentPersonId)
const itemStats = computed(() => store.getItemStats(pid.value))
const plannedEntries = computed(() => Object.entries(store.getPlannedCostByCurrency(pid.value)))
const paidEntries = computed(() => Object.entries(store.getPaidCostByCurrency(pid.value)))

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
        <UIcon name="i-heroicons-arrow-left" class="w-4 h-4" /> All Events
      </NuxtLink>

      <div class="flex items-start justify-between">
        <div>
          <div class="flex items-center gap-3 mb-1">
            <UBadge
              :label="event.type === 'convention' ? 'Convention' : 'Travel'"
              :color="event.type === 'convention' ? 'purple' : 'blue'"
              variant="soft"
            />
            <span v-if="event.date" class="text-gray-400 text-sm">{{ event.date }}</span>
          </div>
          <h1 class="text-3xl font-bold text-white">{{ event.name }}</h1>
          <p v-if="event.location" class="text-gray-400 mt-1">{{ event.location }}</p>
          <p v-if="event.description" class="text-gray-500 text-sm mt-2">{{ event.description }}</p>
        </div>
        <div class="flex gap-2">
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
    <div v-if="personsStore.currentPerson" class="flex items-center gap-2 mb-3 text-sm text-gray-400">
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
      Showing budget for <span class="text-white font-medium">{{ personsStore.currentPerson.name }}</span>
    </div>

    <!-- Stats bar -->
    <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-8">
      <UCard class="text-center p-4">
        <div class="text-2xl font-bold text-purple-400">{{ event.locations?.length ?? 0 }}</div>
        <div class="text-xs text-gray-400 mt-1">{{ event.type === 'convention' ? 'Halls' : 'Locations' }}</div>
      </UCard>
      <UCard class="text-center p-4">
        <div class="text-2xl font-bold text-blue-400">
          {{ event.locations?.reduce((sum, l) => sum + (l.booths?.length ?? 0), 0) ?? 0 }}
        </div>
        <div class="text-xs text-gray-400 mt-1">{{ event.type === 'convention' ? 'Booths' : 'Shops' }}</div>
      </UCard>
      <UCard class="text-center p-4">
        <div class="text-2xl font-bold text-green-400">{{ itemStats.purchased }}/{{ itemStats.total }}</div>
        <div class="text-xs text-gray-400 mt-1">Purchased</div>
      </UCard>
      <UCard class="text-center p-4">
        <div v-if="plannedEntries.length" class="font-bold text-yellow-400 leading-snug">
          <div v-for="[cur, amt] in plannedEntries" :key="cur" class="text-xl">
            {{ amt.toFixed(2) }} {{ cur }}
          </div>
        </div>
        <div v-else class="text-xl font-bold text-yellow-400">—</div>
        <div class="text-xs text-gray-400 mt-1">Planned Budget</div>
      </UCard>
      <UCard class="text-center p-4">
        <div v-if="paidEntries.length" class="font-bold text-green-400 leading-snug">
          <div v-for="[cur, amt] in paidEntries" :key="cur" class="text-xl">
            {{ amt.toFixed(2) }} {{ cur }}
          </div>
        </div>
        <div v-else class="text-xl font-bold text-gray-600">—</div>
        <div class="text-xs text-gray-400 mt-1">Paid</div>
      </UCard>
    </div>

    <!-- Locations/Halls -->
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-xl font-bold text-white">
        {{ event.type === 'convention' ? 'Halls' : 'Locations' }}
      </h2>
      <UButton v-if="authStore.isEditing" icon="i-heroicons-plus" color="purple" size="sm" @click="showAddLocation = true">
        Add {{ event.type === 'convention' ? 'Hall' : 'Location' }}
      </UButton>
    </div>

    <div v-if="!event.locations?.length" class="text-center py-10 text-gray-500">
      No {{ event.type === 'convention' ? 'halls' : 'locations' }} yet. Add one to start planning.
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

    <UModal v-model="showDeleteLocationModal" :ui="{ width: 'sm:max-w-sm' }">
      <UCard>
        <template #header><h3 class="font-semibold text-white">Delete Location?</h3></template>
        <p class="text-gray-400 text-sm">This will delete all booths and products in this location.</p>
        <template #footer>
          <div class="flex gap-2 justify-end">
            <UButton variant="ghost" color="gray" @click="showDeleteLocationModal = false">Cancel</UButton>
            <UButton color="red" @click="handleDeleteLocation">Delete</UButton>
          </div>
        </template>
      </UCard>
    </UModal>
  </div>
</template>
