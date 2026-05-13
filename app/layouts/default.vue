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

const showPersonManager = ref(false)
const showUserMenu = ref(false)
const newPersonName = ref('')

onMounted(() => personsStore.fetchPersons())

// Guests don't filter by person — clear any persisted selection while locked
watch(() => authStore.isEditing, (editing) => {
  if (!editing && personsStore.currentPersonId) personsStore.selectPerson(null)
}, { immediate: true })

async function addPerson() {
  if (!newPersonName.value.trim()) return
  await personsStore.createPerson(newPersonName.value.trim())
  newPersonName.value = ''
}

async function handleLogout() {
  showUserMenu.value = false
  await authStore.logout()
  personsStore.selectPerson(null)
  router.push('/')
}

const COLOR_MAP: Record<string, string> = {
  purple: 'bg-purple-500',
  blue: 'bg-blue-500',
  green: 'bg-green-500',
  yellow: 'bg-yellow-500',
  red: 'bg-red-500',
  pink: 'bg-pink-500',
  orange: 'bg-orange-500',
  teal: 'bg-teal-500',
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
              <span class="truncate max-w-32">{{ authStore.user?.username || '(no name)' }}</span>
              <UIcon name="i-heroicons-chevron-down" class="w-3 h-3 text-gray-500" />
            </button>
            <div
              v-if="showUserMenu"
              class="absolute left-0 top-full mt-1 w-48 bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-50 p-1"
            >
              <div class="px-2 py-2 border-b border-gray-800 mb-1">
                <div class="text-sm text-white truncate">{{ authStore.user?.username }}</div>
                <div class="text-xs text-gray-500 capitalize">{{ authStore.user?.role }}</div>
              </div>
              <NuxtLink
                to="/account"
                class="flex items-center gap-2 px-2 py-1.5 rounded text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
                @click="showUserMenu = false"
              >
                <UIcon name="i-heroicons-cog-6-tooth" class="w-4 h-4" />
                {{ t('nav.account') }}
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

          <NuxtLink to="/" class="flex items-center gap-2 font-bold text-lg text-white hover:text-purple-400 transition-colors">
            <UIcon name="i-heroicons-shopping-bag" class="w-6 h-6 text-purple-400" />
            <span class="hidden sm:inline">MerchTracker</span>
          </NuxtLink>
        </div>

        <!-- Right: Language selector + Person selector + nav buttons -->
        <div class="flex items-center gap-2">
          <LanguageSelector />

          <!-- Person selector (editors/admins only) -->
          <div v-if="authStore.isEditing" class="relative">
            <button
              class="flex items-center gap-2 px-3 py-1.5 rounded border border-gray-700 hover:border-gray-500 transition-colors text-sm"
              @click="showPersonManager = !showPersonManager"
            >
              <span
                v-if="personsStore.currentPerson"
                :class="['w-3 h-3 rounded-full shrink-0', COLOR_MAP[personsStore.currentPerson.color] ?? 'bg-purple-500']"
              />
              <UIcon v-else name="i-heroicons-user-circle" class="w-4 h-4 text-gray-400" />
              <span class="text-gray-300 max-w-24 truncate">
                {{ personsStore.currentPerson?.name ?? t('nav.person') }}
              </span>
              <UIcon name="i-heroicons-chevron-down" class="w-3 h-3 text-gray-500" />
            </button>

            <!-- Dropdown -->
            <div
              v-if="showPersonManager"
              class="absolute right-0 top-full mt-1 w-56 bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-50 p-2"
            >
              <div class="text-xs text-gray-500 px-2 py-1 mb-1">{{ t('nav.selectPerson') }}</div>

              <button
                class="w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm hover:bg-gray-800 transition-colors"
                :class="!personsStore.currentPersonId ? 'text-white' : 'text-gray-400'"
                @click="personsStore.selectPerson(null); showPersonManager = false"
              >
                <UIcon name="i-heroicons-user-circle" class="w-4 h-4" />
                {{ t('nav.allNone') }}
              </button>

              <button
                v-for="person in personsStore.persons"
                :key="person.id"
                class="w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm hover:bg-gray-800 transition-colors group"
                :class="personsStore.currentPersonId === person.id ? 'text-white' : 'text-gray-400'"
                @click="personsStore.selectPerson(person.id); showPersonManager = false"
              >
                <span :class="['w-3 h-3 rounded-full shrink-0', COLOR_MAP[person.color] ?? 'bg-purple-500']" />
                <span class="flex-1 text-left truncate">{{ person.name }}</span>
                <UButton
                  v-if="authStore.isEditing"
                  icon="i-heroicons-trash"
                  variant="ghost"
                  color="red"
                  size="xs"
                  class="opacity-0 group-hover:opacity-100 -mr-1"
                  @click.stop="personsStore.deletePerson(person.id)"
                />
              </button>

              <div v-if="authStore.isEditing" class="mt-2 pt-2 border-t border-gray-800">
                <div class="flex gap-1">
                  <UInput
                    v-model="newPersonName"
                    size="xs"
                    :placeholder="t('nav.newPersonPlaceholder')"
                    class="flex-1"
                    @keydown.enter="addPerson"
                  />
                  <UButton size="xs" color="purple" icon="i-heroicons-plus" @click="addPerson" />
                </div>
              </div>
            </div>
          </div>

          <UButton to="/" variant="ghost" icon="i-heroicons-home" color="gray" size="sm" class="sm:hidden" />
          <UButton to="/" variant="ghost" icon="i-heroicons-home" color="gray" size="sm" class="hidden sm:flex">
            {{ t('nav.events') }}
          </UButton>

          <UButton
            v-if="authStore.isEditing"
            to="/events/create"
            icon="i-heroicons-plus"
            color="purple"
            size="sm"
            class="sm:hidden"
          />
          <UButton
            v-if="authStore.isEditing"
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

    <!-- Click outside to close dropdowns -->
    <div
      v-if="showPersonManager || showUserMenu"
      class="fixed inset-0 z-40"
      @click="showPersonManager = false; showUserMenu = false"
    />
  </div>
</template>
