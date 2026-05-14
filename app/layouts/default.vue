<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '~/stores/auth'
import { usePersonsStore } from '~/stores/persons'
import { useLocale } from '~/composables/useLocale'

const authStore = useAuthStore()
const personsStore = usePersonsStore()
const { t } = useLocale()
const router = useRouter()

const showUserMenu = ref(false)

// Color mode (default 'dark' is set in nuxt.config.ts). The button just flips
// the preference; @nuxt/ui handles applying the `dark` class to <html> and
// persisting the choice in localStorage.
// @ts-expect-error useColorMode is a Nuxt auto-import; the TS server in this
// editor occasionally doesn't resolve Nuxt's generated types in time. Works at runtime.
const colorMode = useColorMode()
function toggleColorMode() {
  colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark'
}

onMounted(() => personsStore.fetchPersons())

// Tie the "currently viewing as" filter to the logged-in user's own person:
//   - logged out → clear filter
//   - logged in with no filter set → default to own person
//   - logged in with an existing filter (admin override or persisted) → leave alone
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
</script>

<template>
  <div class="min-h-screen bg-gray-950 text-white">
    <nav class="border-b border-gray-800 bg-gray-900/80 backdrop-blur sticky top-0 z-50">
      <div class="max-w-7xl mx-auto px-4 flex items-center justify-between h-16">
        <!-- Left: User menu / login button + logo -->
        <div class="flex items-center gap-3">
          <!-- Logged in: avatar/menu -->
          <div v-if="authStore.isLoggedIn" class="relative">
            <button
              class="px-2 sm:px-3 py-1.5 text-xs font-medium rounded border transition-colors flex items-center gap-1.5"
              :class="authStore.isEditing
                ? 'border-purple-500 text-purple-400 hover:bg-purple-500/10'
                : 'border-gray-700 text-gray-300 hover:border-gray-500 hover:text-white'"
              @click="showUserMenu = !showUserMenu"
            >
              <UIcon name="i-heroicons-user-circle" class="w-4 h-4" />
              <span class="truncate max-w-32">{{ authStore.user?.person?.name || authStore.user?.username || '(no name)' }}</span>
              <UIcon name="i-heroicons-chevron-down" class="w-3 h-3 text-gray-500" />
            </button>
            <div
              v-if="showUserMenu"
              class="absolute left-0 top-full mt-1 w-48 bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-50 p-1"
            >
              <div class="px-2 py-2 border-b border-gray-800 mb-1">
                <div class="text-sm text-white truncate">{{ authStore.user?.person?.name || authStore.user?.username }}</div>
                <div class="text-xs text-gray-500 truncate">
                  <span v-if="authStore.user?.person?.name && authStore.user.person.name !== authStore.user.username">@{{ authStore.user.username }} · </span>
                  <span class="capitalize">{{ authStore.user?.role }}</span>
                </div>
              </div>
              <NuxtLink
                to="/account"
                class="flex items-center gap-2 px-2 py-1.5 rounded text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
                @click="showUserMenu = false"
              >
                <UIcon name="i-heroicons-cog-6-tooth" class="w-4 h-4" />
                {{ t('nav.account') }}
              </NuxtLink>
              <NuxtLink
                to="/admin/groups"
                class="flex items-center gap-2 px-2 py-1.5 rounded text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
                @click="showUserMenu = false"
              >
                <UIcon name="i-heroicons-user-group" class="w-4 h-4" />
                {{ t('nav.adminGroups') }}
              </NuxtLink>
              <NuxtLink
                v-if="authStore.isAdmin"
                to="/admin/users"
                class="flex items-center gap-2 px-2 py-1.5 rounded text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
                @click="showUserMenu = false"
              >
                <UIcon name="i-heroicons-user-circle" class="w-4 h-4" />
                {{ t('nav.adminUsers') }}
              </NuxtLink>
              <NuxtLink
                v-if="authStore.isAdmin"
                to="/admin/persons"
                class="flex items-center gap-2 px-2 py-1.5 rounded text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
                @click="showUserMenu = false"
              >
                <UIcon name="i-heroicons-paint-brush" class="w-4 h-4" />
                {{ t('nav.adminPersons') }}
              </NuxtLink>
              <button
                class="w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
                @click="handleLogout"
              >
                <UIcon name="i-heroicons-arrow-right-on-rectangle" class="w-4 h-4" />
                {{ t('nav.logout') }}
              </button>
            </div>
          </div>

          <!-- Logged out: login button -->
          <NuxtLink
            v-else
            to="/login"
            class="px-2 sm:px-3 py-1.5 text-xs font-medium rounded border border-gray-700 text-gray-400 hover:border-gray-500 hover:text-white transition-colors flex items-center gap-1"
            :title="t('nav.login')"
          >
            <UIcon name="i-heroicons-arrow-left-on-rectangle" class="w-4 h-4 sm:hidden" />
            <span class="hidden sm:inline">{{ t('nav.login') }}</span>
          </NuxtLink>

          <!-- Brand: desktop only. On mobile the Home button on the right handles "go home". -->
          <NuxtLink to="/" class="hidden sm:flex items-center gap-2 font-bold text-lg text-white hover:text-purple-400 transition-colors">
            <UIcon name="i-heroicons-shopping-bag" class="w-6 h-6 text-purple-400" />
            <span>MerchTracker</span>
          </NuxtLink>
        </div>

        <!-- Right: Language selector + nav buttons -->
        <div class="flex items-center gap-2">
          <LanguageSelector />

          <UButton to="/" variant="ghost" icon="i-heroicons-home" color="gray" size="sm" class="sm:hidden" />
          <UButton to="/" variant="ghost" icon="i-heroicons-home" color="gray" size="sm" class="hidden sm:flex">
            {{ t('nav.events') }}
          </UButton>

          <UButton
            v-if="authStore.isLoggedIn"
            to="/events/create"
            icon="i-heroicons-plus"
            color="purple"
            size="sm"
            class="sm:hidden"
          />
          <UButton
            v-if="authStore.isLoggedIn"
            to="/events/create"
            icon="i-heroicons-plus"
            color="purple"
            size="sm"
            class="hidden sm:flex"
          >
            {{ t('nav.newEvent') }}
          </UButton>
        </div>
      </div>
    </nav>

    <main class="max-w-7xl mx-auto px-4 py-8">
      <slot />
    </main>

    <!-- Color mode toggle: bottom-right floating button. Sits below the
         fullscreen image overlay (z-[9999]) so it doesn't intrude there. -->
    <button
      type="button"
      class="fixed bottom-4 right-4 z-40 w-11 h-11 rounded-full bg-gray-800 border border-gray-700 text-purple-400 hover:border-purple-500 hover:text-purple-300 flex items-center justify-center shadow-lg transition-colors"
      :title="colorMode.value === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'"
      :aria-label="colorMode.value === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'"
      @click="toggleColorMode"
    >
      <UIcon
        :name="colorMode.value === 'dark' ? 'i-heroicons-moon' : 'i-heroicons-sun'"
        class="w-5 h-5"
      />
    </button>

    <!-- Click outside to close the user menu -->
    <div
      v-if="showUserMenu"
      class="fixed inset-0 z-40"
      @click="showUserMenu = false"
    />
  </div>
</template>
