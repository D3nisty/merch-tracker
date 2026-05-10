<script setup lang="ts">
import { useAuthStore } from '~/stores/auth'
import { usePersonsStore } from '~/stores/persons'
import { useLocale } from '~/composables/useLocale'

const authStore = useAuthStore()
const personsStore = usePersonsStore()
const { t } = useLocale()

const showPasswordModal = ref(false)
const passwordInput = ref('')
const passwordError = ref(false)
const showPersonManager = ref(false)
const newPersonName = ref('')

onMounted(() => personsStore.fetchPersons())

function openPasswordModal() {
  passwordInput.value = ''
  passwordError.value = false
  showPasswordModal.value = true
}

function handleUnlock() {
  const ok = authStore.tryUnlock(passwordInput.value)
  if (ok) {
    showPasswordModal.value = false
  } else {
    passwordError.value = true
  }
}

async function addPerson() {
  if (!newPersonName.value.trim()) return
  await personsStore.createPerson(newPersonName.value.trim())
  newPersonName.value = ''
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
        <!-- Left: Edit mode button + logo -->
        <div class="flex items-center gap-3">
          <button
            v-if="!authStore.isEditing"
            class="px-2 sm:px-3 py-1.5 text-xs font-medium rounded border border-gray-700 text-gray-400 hover:border-gray-500 hover:text-white transition-colors flex items-center gap-1"
            :title="t('nav.edit')"
            @click="openPasswordModal"
          >
            <UIcon name="i-heroicons-pencil-square" class="w-4 h-4 sm:hidden" />
            <span class="hidden sm:inline">{{ t('nav.edit') }}</span>
          </button>
          <button
            v-else
            class="px-2 sm:px-3 py-1.5 text-xs font-medium rounded border border-purple-500 text-purple-400 hover:bg-purple-500/10 transition-colors flex items-center gap-1"
            :title="t('nav.editing')"
            @click="authStore.lock()"
          >
            <UIcon name="i-heroicons-lock-closed" class="w-4 h-4 sm:hidden" />
            <span class="hidden sm:inline">{{ t('nav.editing') }}</span>
          </button>

          <NuxtLink to="/" class="flex items-center gap-2 font-bold text-lg text-white hover:text-purple-400 transition-colors">
            <UIcon name="i-heroicons-shopping-bag" class="w-6 h-6 text-purple-400" />
            <span class="hidden sm:inline">MerchTracker</span>
          </NuxtLink>
        </div>

        <!-- Right: Language selector + Person selector + nav buttons -->
        <div class="flex items-center gap-2">
          <LanguageSelector />

          <!-- Person selector -->
          <div class="relative">
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

    <!-- Click outside to close person dropdown -->
    <div
      v-if="showPersonManager"
      class="fixed inset-0 z-40"
      @click="showPersonManager = false"
    />

    <!-- Password modal -->
    <UModal v-model="showPasswordModal" :ui="{ width: 'sm:max-w-xs' }">
      <UCard>
        <template #header>
          <h3 class="font-semibold text-white">{{ t('nav.enterPassword') }}</h3>
        </template>
        <div class="space-y-3">
          <UInput
            v-model="passwordInput"
            type="password"
            :placeholder="t('nav.password')"
            autofocus
            :class="passwordError ? 'ring-2 ring-red-500' : ''"
            @keydown.enter="handleUnlock"
          />
          <p v-if="passwordError" class="text-red-400 text-xs">{{ t('nav.incorrectPassword') }}</p>
        </div>
        <template #footer>
          <div class="flex gap-2 justify-end">
            <UButton variant="ghost" color="gray" @click="showPasswordModal = false">{{ t('common.cancel') }}</UButton>
            <UButton color="purple" @click="handleUnlock">{{ t('nav.unlock') }}</UButton>
          </div>
        </template>
      </UCard>
    </UModal>
  </div>
</template>
