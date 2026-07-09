<script setup lang="ts">
import { useEventsStore } from '~/stores/events'
import { useAuthStore } from '~/stores/auth'
import { useLocale } from '~/composables/useLocale'

const store = useEventsStore()
const authStore = useAuthStore()
const { t } = useLocale()
const route = useRoute()
const router = useRouter()
await store.fetchEvents()

useHead({ title: 'Trips' })

// Segmented filter — kept in sync with the sidebar nav via the `?type=` query.
const globalSearch = useState<string>('nomadSearch', () => '')
const activeTab = computed<'all' | 'travel' | 'convention'>(() => {
  if (route.query.type === 'travel') return 'travel'
  if (route.query.type === 'convention') return 'convention'
  return 'all'
})
function setTab(tab: 'all' | 'travel' | 'convention') {
  router.replace({ query: tab === 'all' ? {} : { type: tab } })
}

const tabs = computed(() => [
  { key: 'all' as const, label: t('events.all') },
  { key: 'travel' as const, label: t('events.travel') },
  { key: 'convention' as const, label: t('events.conventions') },
])

const filteredEvents = computed(() => {
  const q = globalSearch.value.trim().toLowerCase()
  return store.events.filter((e) => {
    if (activeTab.value !== 'all' && e.type !== activeTab.value) return false
    if (q && !(`${e.name} ${e.location ?? ''}`.toLowerCase().includes(q))) return false
    return true
  })
})

const totalPurchased = computed(() => store.events.reduce((s, e) => s + (e.purchasedProducts ?? 0), 0))
const totalItems = computed(() => store.events.reduce((s, e) => s + (e.totalProducts ?? 0), 0))

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
    <!-- Header -->
    <div class="flex items-end justify-between gap-3 flex-wrap mb-5">
      <div class="min-w-0">
        <h1 class="text-[25px] font-bold text-ink-strong">{{ t('events.tripsTitle') }}</h1>
        <p class="text-[13.5px] text-muted mt-0.5">
          {{ store.events.length }} {{ store.events.length === 1 ? t('events.travelType') : t('events.travel') }} ·
          <span class="text-bought font-semibold mono">{{ totalPurchased }}/{{ totalItems }}</span> {{ t('event.purchased') }}
        </p>
      </div>
      <!-- segmented tabs -->
      <div class="flex gap-1 p-1 rounded-[11px] border border-line bg-surface-2">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          type="button"
          class="px-3.5 py-1.5 rounded-[8px] text-[12.5px] transition-colors"
          :class="activeTab === tab.key ? 'bg-sky text-on-accent font-bold' : 'text-muted hover:text-ink font-medium'"
          @click="setTab(tab.key)"
        >{{ tab.label }}</button>
      </div>
    </div>

    <!-- Empty state -->
    <div v-if="store.events.length === 0 && !store.loading" class="text-center py-20">
      <UIcon name="i-heroicons-shopping-bag" class="w-16 h-16 text-faint-2 mx-auto mb-4" />
      <h2 class="text-xl font-semibold text-muted mb-2">{{ t('events.noEvents') }}</h2>
      <p class="text-faint mb-6">{{ t('events.noEventsDesc') }}</p>
      <NuxtLink v-if="authStore.isLoggedIn" to="/events/create" class="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-field grad-primary text-sm font-bold">
        <UIcon name="i-heroicons-plus" class="w-4 h-4" /> {{ t('events.createEvent') }}
      </NuxtLink>
      <NuxtLink v-else to="/login" class="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-field grad-primary text-sm font-bold">
        <UIcon name="i-heroicons-arrow-left-on-rectangle" class="w-4 h-4" /> {{ t('nav.login') }}
      </NuxtLink>
    </div>

    <!-- Card grid -->
    <div v-else class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-[15px]">
      <EventCard v-for="event in filteredEvents" :key="event.id" :event="event" @delete="confirmDelete(event.id)" />

      <!-- dashed "new trip" tile -->
      <NuxtLink
        v-if="authStore.isLoggedIn"
        to="/events/create"
        class="border-[1.5px] border-dashed border-line-focus/70 rounded-window flex flex-col items-center justify-center gap-2.5 min-h-[210px] text-muted hover:border-line-focus transition-colors"
      >
        <span class="w-11 h-11 rounded-field border-[1.5px] border-dashed border-line-focus flex items-center justify-center">
          <UIcon name="i-heroicons-plus" class="w-5 h-5 text-sky-soft" />
        </span>
        <span class="text-[13px] font-semibold">{{ t('nav.newEvent') }}</span>
      </NuxtLink>
    </div>

    <!-- Delete confirm -->
    <UModal v-model="showDeleteModal" :ui="{ width: 'sm:max-w-sm', background: '', ring: '', rounded: 'rounded-window', shadow: '' }">
      <div class="bg-surface border border-line rounded-window p-6 text-center">
        <div class="w-12 h-12 mx-auto mb-3.5 rounded-card bg-chip-must flex items-center justify-center">
          <UIcon name="i-heroicons-trash" class="w-6 h-6 text-must" />
        </div>
        <h3 class="text-[17px] font-bold text-ink-strong mb-1.5">{{ t('events.deleteTitle') }}</h3>
        <p class="text-[13px] text-muted mb-5 leading-relaxed">{{ t('events.deleteDesc') }}</p>
        <div class="flex gap-2.5">
          <button class="flex-1 py-2.5 rounded-field border border-line text-ink text-[13px] font-semibold" @click="showDeleteModal = false">{{ t('common.cancel') }}</button>
          <button class="flex-1 py-2.5 rounded-field bg-must text-chip-must text-[13px] font-bold" @click="handleDelete">{{ t('common.delete') }}</button>
        </div>
      </div>
    </UModal>
  </div>
</template>
