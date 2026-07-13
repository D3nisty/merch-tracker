<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { onClickOutside } from '@vueuse/core'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '~/stores/auth'
import { usePersonsStore } from '~/stores/persons'
import { useEventsStore } from '~/stores/events'
import { useLocale } from '~/composables/useLocale'
import { useMobileFab } from '~/composables/useMobileFab'

const authStore = useAuthStore()
const personsStore = usePersonsStore()
const eventsStore = useEventsStore()
const { t } = useLocale()
const route = useRoute()
const router = useRouter()

const showUserMenu = ref(false)
// Close the popup on any click outside the user-card wrapper. We use this
// instead of a full-screen overlay because the sidebar's `position: sticky`
// creates a stacking context that would trap the popup *below* such an
// overlay — the overlay would then eat every menu click.
const userMenuRef = ref<HTMLElement | null>(null)
onClickOutside(userMenuRef, () => { showUserMenu.value = false })

// Global search box in the top utility bar. The trips-home page reads this
// state to filter its card grid live.
const globalSearch = useState<string>('nomadSearch', () => '')

// Command palette: global search across events/cities/booths/products/schedule
// + a file-explorer view. Opened from the top box, the mobile search icon, or ⌘K.
const showSearch = ref(false)
const searchInitial = ref('')
function openSearch(seed = '') {
  searchInitial.value = seed
  showSearch.value = true
}
function onSearchKey(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
    e.preventDefault()
    openSearch(globalSearch.value)
  }
}
onMounted(() => window.addEventListener('keydown', onSearchKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onSearchKey))

// Color mode (default 'dark' from nuxt.config). @nuxt/ui applies the class to
// <html> and persists the preference.
// @ts-expect-error useColorMode is a Nuxt auto-import; TS server occasionally
// doesn't resolve Nuxt's generated types in time. Works at runtime.
const colorMode = useColorMode()
function toggleColorMode() {
  colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark'
}

onMounted(() => personsStore.fetchPersons())

// Tie the "viewing as" filter to the logged-in user's own person (unchanged).
watch(() => authStore.user, (u) => {
  if (!u) {
    personsStore.selectPerson(null)
  } else if (!personsStore.currentPersonId && u.personId) {
    personsStore.selectPerson(u.personId)
  }
}, { immediate: true })

async function handleLogout() {
  showUserMenu.value = false
  await authStore.logout()
  personsStore.selectPerson(null)
  router.push('/')
}

// Context-aware mobile FAB: run the page's registered "add" action, or fall
// back to creating a new event.
const { fab } = useMobileFab()
function onMobileFab() {
  if (fab.value) fab.value.run()
  else router.push('/events/create')
}

// ── Contextual accent ──────────────────────────────────────────────────
// Sky is the primary accent; on convention detail/booth pages the sidebar
// logo + active nav switch to the indigo (convention) set.
const currentEvent = computed(() => eventsStore.currentEvent)
const onEventRoute = computed(() => route.path.startsWith('/events/') && !!currentEvent.value)
const isConvContext = computed(() => onEventRoute.value && currentEvent.value?.type === 'convention')

// ── Active nav highlight ───────────────────────────────────────────────
const activeNav = computed(() => {
  if (route.path === '/admin/groups') return 'groups'
  if (onEventRoute.value) return currentEvent.value?.type === 'convention' ? 'convention' : 'travel'
  if (route.path === '/') {
    if (route.query.type === 'travel') return 'travel'
    if (route.query.type === 'convention') return 'convention'
    return 'all'
  }
  return ''
})

const navItems = computed(() => [
  { key: 'all', label: t('nav.allTrips'), icon: 'i-heroicons-squares-2x2', to: '/' },
  { key: 'travel', label: t('events.travel'), icon: 'i-heroicons-map', to: '/?type=travel' },
  { key: 'convention', label: t('events.conventions'), icon: 'i-heroicons-ticket', to: '/?type=convention' },
])

// ── "This trip/convention" sub-list on detail pages ────────────────────
const contextLocations = computed(() => (onEventRoute.value ? currentEvent.value?.locations ?? [] : []))
const activeLocationId = computed(() => {
  // Booth page: highlight the hall/city that owns the booth.
  const boothSlug = route.params.boothSlug as string | undefined
  if (boothSlug && currentEvent.value) {
    for (const loc of currentEvent.value.locations ?? []) {
      if ((loc.booths ?? []).some(b => b.slug === boothSlug || b.id === boothSlug)) return loc.id
    }
  }
  return currentEvent.value?.locations?.[0]?.id ?? null
})
const eventSlug = computed(() => currentEvent.value?.slug ?? currentEvent.value?.id ?? '')

// ── Avatar ─────────────────────────────────────────────────────────────
const PERSON_BG: Record<string, string> = {
  purple: 'bg-conv', blue: 'bg-sky', green: 'bg-bought', yellow: 'bg-planned',
  red: 'bg-must', pink: 'bg-pink-400', orange: 'bg-orange-400', teal: 'bg-teal-400',
}
const avatarBg = computed(() => PERSON_BG[authStore.user?.person?.color ?? ''] ?? 'bg-surface-2')
const avatarText = computed(() => (authStore.user?.person?.color ? 'text-on-accent' : 'text-sky-soft'))
const displayName = computed(() => authStore.user?.person?.name || authStore.user?.username || '')
const initial = computed(() => (displayName.value.trim()[0] ?? '?').toUpperCase())
</script>

<template>
  <div class="min-h-screen bg-app text-ink flex">
    <!-- ══════════════════ SIDEBAR (desktop) ══════════════════ -->
    <aside
      class="hidden lg:flex w-[222px] shrink-0 flex-col gap-1 bg-sidebar border-r border-line-soft px-3.5 py-5 sticky top-0 h-screen overflow-y-auto"
    >
      <!-- brand -->
      <NuxtLink to="/" class="flex items-center gap-2.5 px-2 pb-4 pt-1">
        <span
          class="w-[30px] h-[30px] rounded-[9px] flex items-center justify-center"
          :class="isConvContext ? 'grad-conv' : 'grad-primary'"
        >
          <UIcon name="i-heroicons-shopping-bag" class="w-4 h-4 text-on-accent" />
        </span>
        <span class="font-display font-bold text-[15px] text-ink-strong">merchtracker</span>
      </NuxtLink>

      <!-- primary nav -->
      <NuxtLink
        v-for="item in navItems"
        :key="item.key"
        :to="item.to"
        class="flex items-center gap-[11px] px-3 py-2.5 rounded-field text-sm transition-colors"
        :class="activeNav === item.key
          ? (isConvContext ? 'bg-chip-conv text-ink-strong font-semibold' : 'bg-line-soft text-ink-strong font-semibold')
          : 'text-muted hover:text-ink font-medium'"
      >
        <UIcon
          :name="item.icon"
          class="w-4 h-4 shrink-0"
          :class="activeNav === item.key ? (isConvContext ? 'text-conv-soft' : 'text-sky') : ''"
        />
        {{ item.label }}
      </NuxtLink>

      <div class="h-px bg-line-soft mx-1.5 my-3" />

      <NuxtLink
        v-if="authStore.isLoggedIn"
        to="/admin/groups"
        class="flex items-center gap-[11px] px-3 py-2.5 rounded-field text-sm transition-colors"
        :class="activeNav === 'groups' ? 'bg-line-soft text-ink-strong font-semibold' : 'text-muted hover:text-ink font-medium'"
      >
        <UIcon name="i-heroicons-user-group" class="w-4 h-4 shrink-0" :class="activeNav === 'groups' ? 'text-sky' : ''" />
        {{ t('nav.groups') }}
      </NuxtLink>

      <!-- contextual "This trip/convention" sub-list -->
      <template v-if="contextLocations.length">
        <div class="text-[10px] uppercase tracking-[0.1em] text-faint-2 font-bold px-3 pt-2 pb-1.5">
          {{ isConvContext ? t('nav.thisConvention') : t('nav.thisTrip') }}
        </div>
        <NuxtLink
          v-for="loc in contextLocations"
          :key="loc.id"
          :to="`/events/${eventSlug}#loc-${loc.id}`"
          class="flex items-center gap-2.5 px-3 py-2 rounded-[9px] text-xs transition-colors truncate"
          :class="loc.id === activeLocationId
            ? (isConvContext ? 'bg-surface-2 text-conv-soft font-semibold' : 'bg-surface-2 text-sky-soft font-semibold')
            : 'text-muted hover:text-ink'"
        >
          <span
            class="w-1.5 h-1.5 rounded-full shrink-0"
            :class="loc.id === activeLocationId ? (isConvContext ? 'bg-conv' : 'bg-sky') : 'bg-faint-2'"
          />
          <span class="truncate">{{ loc.name }}</span>
        </NuxtLink>
      </template>

      <div class="flex-1" />

      <!-- settings -->
      <NuxtLink
        v-if="authStore.isLoggedIn"
        to="/account"
        class="flex items-center gap-[11px] px-3 py-2.5 rounded-field text-sm font-medium text-muted hover:text-ink transition-colors"
      >
        <UIcon name="i-heroicons-cog-6-tooth" class="w-4 h-4 shrink-0" />
        {{ t('nav.settings') }}
      </NuxtLink>

      <!-- user card / sign-in -->
      <div v-if="authStore.isLoggedIn" ref="userMenuRef" class="relative mt-1.5">
        <button
          type="button"
          class="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-field bg-surface-2 border border-line-soft hover:border-line transition-colors text-left"
          @click="showUserMenu = !showUserMenu"
        >
          <span class="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0" :class="[avatarBg, avatarText]">{{ initial }}</span>
          <span class="min-w-0 flex-1">
            <span class="block text-xs text-ink font-semibold truncate">{{ displayName }}</span>
            <span class="block text-[10.5px] text-faint capitalize truncate">{{ authStore.user?.role }}</span>
          </span>
        </button>
        <!-- popup menu -->
        <div
          v-if="showUserMenu"
          class="absolute bottom-full left-0 right-0 mb-2 bg-surface border border-line rounded-card shadow-pop p-1 z-50"
        >
          <NuxtLink to="/account" class="flex items-center gap-2 px-2.5 py-2 rounded-[8px] text-sm text-muted hover:bg-surface-2 hover:text-ink transition-colors" @click="showUserMenu = false">
            <UIcon name="i-heroicons-cog-6-tooth" class="w-4 h-4" /> {{ t('nav.account') }}
          </NuxtLink>
          <template v-if="authStore.isAdmin">
            <NuxtLink to="/admin/users" class="flex items-center gap-2 px-2.5 py-2 rounded-[8px] text-sm text-muted hover:bg-surface-2 hover:text-ink transition-colors" @click="showUserMenu = false">
              <UIcon name="i-heroicons-user-circle" class="w-4 h-4" /> {{ t('nav.adminUsers') }}
            </NuxtLink>
            <NuxtLink to="/admin/persons" class="flex items-center gap-2 px-2.5 py-2 rounded-[8px] text-sm text-muted hover:bg-surface-2 hover:text-ink transition-colors" @click="showUserMenu = false">
              <UIcon name="i-heroicons-paint-brush" class="w-4 h-4" /> {{ t('nav.adminPersons') }}
            </NuxtLink>
            <NuxtLink to="/admin/permissions" class="flex items-center gap-2 px-2.5 py-2 rounded-[8px] text-sm text-muted hover:bg-surface-2 hover:text-ink transition-colors" @click="showUserMenu = false">
              <UIcon name="i-heroicons-key" class="w-4 h-4" /> {{ t('nav.adminPermissions') }}
            </NuxtLink>
            <NuxtLink to="/admin/settings" class="flex items-center gap-2 px-2.5 py-2 rounded-[8px] text-sm text-muted hover:bg-surface-2 hover:text-ink transition-colors" @click="showUserMenu = false">
              <UIcon name="i-heroicons-adjustments-horizontal" class="w-4 h-4" /> {{ t('nav.adminSettings') }}
            </NuxtLink>
          </template>
          <button class="w-full flex items-center gap-2 px-2.5 py-2 rounded-[8px] text-sm text-muted hover:bg-surface-2 hover:text-ink transition-colors" @click="handleLogout">
            <UIcon name="i-heroicons-arrow-right-on-rectangle" class="w-4 h-4" /> {{ t('nav.logout') }}
          </button>
        </div>
      </div>
      <NuxtLink
        v-else
        to="/login"
        class="mt-1.5 flex items-center gap-2.5 px-3 py-2.5 rounded-field bg-surface-2 border border-line-soft hover:border-line transition-colors text-sm font-semibold text-ink"
      >
        <UIcon name="i-heroicons-arrow-left-on-rectangle" class="w-4 h-4" /> {{ t('nav.login') }}
      </NuxtLink>
    </aside>

    <!-- ══════════════════ MAIN COLUMN ══════════════════ -->
    <div class="flex-1 min-w-0 flex flex-col">
      <!-- top utility bar (desktop) -->
      <div class="hidden lg:flex items-center justify-between gap-4 px-7 py-[18px] border-b border-line-soft">
        <button
          type="button"
          class="flex items-center gap-2.5 w-[300px] px-3.5 py-2.5 rounded-field border border-line bg-surface-2 text-muted hover:border-line-focus transition-colors text-left"
          :title="t('search.title')"
          @click="openSearch('')"
        >
          <UIcon name="i-heroicons-magnifying-glass" class="w-4 h-4 shrink-0 text-faint" />
          <span class="flex-1 min-w-0 text-[13px] text-faint truncate">{{ t('nav.searchEverything') }}</span>
          <span class="shrink-0 hidden xl:flex items-center text-[10px] text-faint border border-line rounded px-1.5 py-0.5">⌘K</span>
        </button>
        <div class="flex items-center gap-3">
          <LanguageSelector />
          <button
            type="button"
            class="w-9 h-9 rounded-field border border-line text-muted hover:text-sky hover:border-line-focus flex items-center justify-center transition-colors"
            :title="colorMode.value === 'dark' ? 'Light mode' : 'Dark mode'"
            @click="toggleColorMode"
          >
            <UIcon :name="colorMode.value === 'dark' ? 'i-heroicons-moon' : 'i-heroicons-sun'" class="w-4 h-4" />
          </button>
          <NuxtLink
            v-if="authStore.isLoggedIn"
            to="/events/create"
            class="flex items-center gap-1.5 px-4 py-2.5 rounded-field grad-primary text-[13px] font-bold"
            :class="isConvContext ? 'grad-conv' : 'grad-primary'"
          >
            <UIcon name="i-heroicons-plus" class="w-4 h-4" /> {{ t('nav.newEvent') }}
          </NuxtLink>
        </div>
      </div>

      <!-- mobile top bar -->
      <div class="lg:hidden flex items-center justify-between px-4 h-14 border-b border-line-soft bg-sidebar sticky top-0 z-40">
        <NuxtLink to="/" class="flex items-center gap-2">
          <span class="w-7 h-7 rounded-[8px] flex items-center justify-center" :class="isConvContext ? 'grad-conv' : 'grad-primary'">
            <UIcon name="i-heroicons-shopping-bag" class="w-4 h-4 text-on-accent" />
          </span>
          <span class="font-display font-bold text-sm text-ink-strong">merchtracker</span>
        </NuxtLink>
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="w-8 h-8 rounded-field border border-line text-muted flex items-center justify-center"
            :title="t('search.title')"
            @click="openSearch('')"
          >
            <UIcon name="i-heroicons-magnifying-glass" class="w-4 h-4" />
          </button>
          <LanguageSelector />
          <button
            type="button"
            class="w-8 h-8 rounded-field border border-line text-muted flex items-center justify-center"
            @click="toggleColorMode"
          >
            <UIcon :name="colorMode.value === 'dark' ? 'i-heroicons-moon' : 'i-heroicons-sun'" class="w-4 h-4" />
          </button>
        </div>
      </div>

      <main class="flex-1 px-4 sm:px-6 lg:px-7 py-6 pb-28 lg:pb-10 w-full max-w-[1600px] mx-auto">
        <slot />
      </main>
    </div>

    <!-- ══════════════════ MOBILE BOTTOM TAB BAR ══════════════════ -->
    <nav class="lg:hidden fixed bottom-0 inset-x-0 z-40 flex justify-around items-center px-2 pt-3 pb-4 border-t border-line-soft bg-sidebar">
      <NuxtLink to="/" class="p-1.5" :class="activeNav === 'all' || activeNav === 'travel' || activeNav === 'convention' ? 'text-sky' : 'text-faint'">
        <UIcon name="i-heroicons-squares-2x2" class="w-6 h-6" />
      </NuxtLink>
      <NuxtLink to="/admin/groups" class="p-1.5" :class="activeNav === 'groups' ? 'text-sky' : 'text-faint'">
        <UIcon name="i-heroicons-user-group" class="w-6 h-6" />
      </NuxtLink>
      <button
        v-if="authStore.isLoggedIn"
        type="button"
        class="w-11 h-11 -mt-6 rounded-[14px] flex items-center justify-center shadow-lg"
        :class="isConvContext ? 'grad-conv' : 'grad-primary'"
        :title="fab ? fab.label : t('nav.newEvent')"
        @click="onMobileFab"
      >
        <UIcon :name="fab?.icon ?? 'i-heroicons-plus'" class="w-6 h-6 text-on-accent" />
      </button>
      <NuxtLink to="/account" class="p-1.5 text-faint">
        <UIcon name="i-heroicons-cog-6-tooth" class="w-6 h-6" />
      </NuxtLink>
      <NuxtLink :to="authStore.isLoggedIn ? '/account' : '/login'" class="p-0.5">
        <span v-if="authStore.isLoggedIn" class="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold" :class="[avatarBg, avatarText]">{{ initial }}</span>
        <UIcon v-else name="i-heroicons-arrow-left-on-rectangle" class="w-6 h-6 text-faint" />
      </NuxtLink>
    </nav>

    <!-- global search / file explorer palette -->
    <SearchModal v-model="showSearch" :initial-query="searchInitial" />
  </div>
</template>
