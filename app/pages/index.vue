<script setup lang="ts">
import { useEventsStore } from '~/stores/events'
import { useAuthStore } from '~/stores/auth'
import { useLocale } from '~/composables/useLocale'

const store = useEventsStore()
const authStore = useAuthStore()
const { t } = useLocale()
await store.fetchEvents()

useHead({ title: 'Events' })

const conventionEvents = computed(() => store.events.filter(e => e.type === 'convention'))
const travelEvents = computed(() => store.events.filter(e => e.type === 'travel'))

const showDeleteModal = ref(false)
const deleteTargetId = ref<string | null>(null)

function confirmDelete(id: string) {
  deleteTargetId.value = id
  showDeleteModal.value = true
}

async function handleDelete() {
  if (!deleteTargetId.value) return
  await store.deleteEvent(deleteTargetId.value)
  showDeleteModal.value = false
  deleteTargetId.value = null
}
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-8 gap-3 flex-wrap">
      <div class="min-w-0">
        <h1 class="text-2xl sm:text-3xl font-bold text-white">{{ t('events.title') }}</h1>
        <p class="text-gray-400 mt-1">{{ t('events.subtitle') }}</p>
      </div>
      <UButton v-if="authStore.isLoggedIn" to="/events/create" icon="i-heroicons-plus" color="purple" size="lg">
        {{ t('nav.newEvent') }}
      </UButton>
    </div>

    <!-- Empty state -->
    <div v-if="store.events.length === 0 && !store.loading" class="text-center py-20">
      <UIcon name="i-heroicons-shopping-bag" class="w-16 h-16 text-gray-600 mx-auto mb-4" />
      <h2 class="text-xl font-semibold text-gray-400 mb-2">{{ t('events.noEvents') }}</h2>
      <p class="text-gray-500 mb-6">{{ t('events.noEventsDesc') }}</p>
      <UButton v-if="authStore.isLoggedIn" to="/events/create" icon="i-heroicons-plus" color="purple">{{ t('events.createEvent') }}</UButton>
      <UButton v-else to="/login" icon="i-heroicons-arrow-left-on-rectangle" color="purple">{{ t('nav.login') }}</UButton>
    </div>

    <!-- Conventions -->
    <section v-if="conventionEvents.length > 0" class="mb-10">
      <div class="flex items-center gap-2 mb-4">
        <UIcon name="i-heroicons-ticket" class="w-5 h-5 text-purple-400" />
        <h2 class="text-xl font-bold text-white">{{ t('events.conventions') }}</h2>
        <UBadge :label="String(conventionEvents.length)" color="purple" variant="soft" />
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <EventCard v-for="event in conventionEvents" :key="event.id" :event="event" @delete="confirmDelete(event.id)" />
      </div>
    </section>

    <!-- Travel events (API already filters to events the caller can see) -->
    <section v-if="travelEvents.length > 0">
      <div class="flex items-center gap-2 mb-4">
        <UIcon name="i-heroicons-map" class="w-5 h-5 text-blue-400" />
        <h2 class="text-xl font-bold text-white">{{ t('events.travel') }}</h2>
        <UBadge :label="String(travelEvents.length)" color="blue" variant="soft" />
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <EventCard v-for="event in travelEvents" :key="event.id" :event="event" @delete="confirmDelete(event.id)" />
      </div>
    </section>

    <!-- Delete confirm modal -->
    <UModal v-model="showDeleteModal" :ui="{ width: 'sm:max-w-sm' }">
      <UCard>
        <template #header>
          <h3 class="font-semibold text-white">{{ t('events.deleteTitle') }}</h3>
        </template>
        <p class="text-gray-400 text-sm">{{ t('events.deleteDesc') }}</p>
        <template #footer>
          <div class="flex gap-2 justify-end">
            <UButton variant="ghost" color="gray" @click="showDeleteModal = false">{{ t('common.cancel') }}</UButton>
            <UButton color="red" @click="handleDelete">{{ t('common.delete') }}</UButton>
          </div>
        </template>
      </UCard>
    </UModal>
  </div>
</template>
