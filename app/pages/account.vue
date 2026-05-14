<script setup lang="ts">
import { useAuthStore } from '~/stores/auth'
import { usePersonsStore } from '~/stores/persons'
import { useLocale } from '~/composables/useLocale'

definePageMeta({ layout: 'default' })

const authStore = useAuthStore()
const personsStore = usePersonsStore()
const { t } = useLocale()
const router = useRouter()

useHead({ title: 'Account' })

const COLORS = ['purple', 'blue', 'green', 'yellow', 'red', 'pink', 'orange', 'teal'] as const
const COLOR_BG: Record<string, string> = {
  purple: 'bg-purple-500',
  blue: 'bg-blue-500',
  green: 'bg-green-500',
  yellow: 'bg-yellow-500',
  red: 'bg-red-500',
  pink: 'bg-pink-500',
  orange: 'bg-orange-500',
  teal: 'bg-teal-500',
}

const currentPassword = ref('')
const newPassword = ref('')
const error = ref('')
const success = ref(false)
const submitting = ref(false)

const colorError = ref('')
const colorSuccess = ref(false)

const displayName = ref('')
const nameError = ref('')
const nameSaving = ref(false)
const nameSuccess = ref(false)

onMounted(async () => {
  if (!authStore.user) await authStore.fetchMe()
  if (!authStore.isLoggedIn) router.replace('/login?redirect=/account')
  // Ensure persons list is loaded for the admin "view as" picker
  if (authStore.isAdmin && personsStore.persons.length === 0) {
    await personsStore.fetchPersons()
  }
  // Seed the display-name input with the current value
  displayName.value = authStore.user?.person?.name ?? authStore.user?.username ?? ''
})

// Keep the input synced if the auth store user changes elsewhere
watch(() => authStore.user?.person?.name, (n) => {
  if (n && n !== displayName.value) displayName.value = n
})

async function submit() {
  if (!currentPassword.value || newPassword.value.length < 6) {
    error.value = t('auth.passwordTooShort')
    return
  }
  submitting.value = true
  error.value = ''
  success.value = false
  const res = await authStore.changePassword(currentPassword.value, newPassword.value)
  submitting.value = false
  if (res.ok) {
    success.value = true
    currentPassword.value = ''
    newPassword.value = ''
  } else {
    error.value = res.message
  }
}

async function pickColor(color: string) {
  if (color === authStore.user?.person?.color) return
  colorError.value = ''
  colorSuccess.value = false
  const res = await authStore.updateMyProfile({ color })
  if (res.ok) {
    colorSuccess.value = true
    // The current view-as person is usually self — refresh the persons list so
    // colored dots in the rest of the UI pick up the change.
    await personsStore.fetchPersons()
  } else {
    colorError.value = res.message
  }
}

async function saveName() {
  const name = displayName.value.trim()
  if (!name || name === authStore.user?.person?.name) return
  if (name.length > 60) {
    nameError.value = 'Display name must be at most 60 characters.'
    return
  }
  nameError.value = ''
  nameSuccess.value = false
  nameSaving.value = true
  const res = await authStore.updateMyProfile({ name })
  nameSaving.value = false
  if (res.ok) {
    nameSuccess.value = true
    await personsStore.fetchPersons()
  } else {
    nameError.value = res.message
  }
}

// Admin: "view as another person" picker. Defaults to self.
const viewAsId = computed({
  get: () => personsStore.currentPersonId ?? '',
  set: (v: string) => personsStore.selectPerson(v || null),
})

const viewAsOptions = computed(() => [
  { value: authStore.user?.personId ?? '', label: t('auth.viewAsSelf') },
  ...personsStore.persons
    .filter(p => p.id !== authStore.user?.personId)
    .map(p => ({ value: p.id, label: p.name })),
])
</script>

<template>
  <div v-if="authStore.user" class="max-w-md mx-auto">
    <UCard class="mb-4">
      <template #header>
        <h1 class="font-bold text-white text-lg">{{ t('auth.accountTitle') }}</h1>
      </template>
      <dl class="text-sm space-y-2">
        <div class="flex justify-between">
          <dt class="text-gray-400">{{ t('nav.username') }}</dt>
          <dd class="text-white font-medium">{{ authStore.user.username }}</dd>
        </div>
        <div class="flex justify-between">
          <dt class="text-gray-400">{{ t('auth.role') }}</dt>
          <dd class="text-white font-medium capitalize">{{ authStore.user.role }}</dd>
        </div>
      </dl>
    </UCard>

    <!-- Display name -->
    <UCard class="mb-4">
      <template #header>
        <h2 class="font-semibold text-white">{{ t('auth.displayName') }}</h2>
        <p class="text-xs text-gray-400 mt-0.5">{{ t('auth.displayNameDesc') }}</p>
      </template>
      <div class="flex gap-2">
        <UInput
          v-model="displayName"
          class="flex-1"
          maxlength="60"
          @keydown.enter="saveName"
        />
        <UButton
          color="purple"
          :loading="nameSaving"
          :disabled="!displayName.trim() || displayName.trim() === authStore.user?.person?.name"
          @click="saveName"
        >{{ t('common.save') }}</UButton>
      </div>
      <p v-if="nameError" class="text-red-400 text-xs mt-2">{{ nameError }}</p>
      <p v-if="nameSuccess" class="text-green-400 text-xs mt-2">{{ t('auth.profileUpdated') }}</p>
    </UCard>

    <!-- Identity color -->
    <UCard class="mb-4">
      <template #header>
        <h2 class="font-semibold text-white">{{ t('auth.yourColor') }}</h2>
        <p class="text-xs text-gray-400 mt-0.5">{{ t('auth.yourColorDesc') }}</p>
      </template>
      <div class="flex gap-2 flex-wrap">
        <button
          v-for="c in COLORS"
          :key="c"
          type="button"
          :class="[
            'w-9 h-9 rounded-full transition-all',
            COLOR_BG[c],
            authStore.user.person?.color === c
              ? 'ring-2 ring-white ring-offset-2 ring-offset-gray-900 scale-110'
              : 'hover:scale-105 opacity-80 hover:opacity-100',
          ]"
          :title="c"
          @click="pickColor(c)"
        />
      </div>
      <p v-if="colorError" class="text-red-400 text-xs mt-3">{{ colorError }}</p>
      <p v-if="colorSuccess" class="text-green-400 text-xs mt-3">{{ t('auth.colorUpdated') }}</p>
    </UCard>

    <!-- Admin: view as another person -->
    <UCard v-if="authStore.isAdmin" class="mb-4">
      <template #header>
        <h2 class="font-semibold text-white">{{ t('auth.viewAs') }}</h2>
        <p class="text-xs text-gray-400 mt-0.5">{{ t('auth.viewAsDesc') }}</p>
      </template>
      <USelect
        v-model="viewAsId"
        :options="viewAsOptions"
        option-attribute="label"
        value-attribute="value"
      />
    </UCard>

    <UCard>
      <template #header>
        <h2 class="font-semibold text-white">{{ t('auth.changePassword') }}</h2>
      </template>
      <form class="space-y-3" @submit.prevent="submit">
        <div>
          <label class="block text-xs text-gray-400 mb-1">{{ t('auth.currentPassword') }}</label>
          <UInput v-model="currentPassword" type="password" autocomplete="current-password" />
        </div>
        <div>
          <label class="block text-xs text-gray-400 mb-1">{{ t('auth.newPassword') }}</label>
          <UInput v-model="newPassword" type="password" autocomplete="new-password" />
        </div>
        <p v-if="error" class="text-red-400 text-xs">{{ error }}</p>
        <p v-if="success" class="text-green-400 text-xs">{{ t('auth.passwordChanged') }}</p>
      </form>
      <template #footer>
        <div class="flex justify-end">
          <UButton
            color="purple"
            :loading="submitting"
            :disabled="!currentPassword || newPassword.length < 6"
            @click="submit"
          >
            {{ t('common.save') }}
          </UButton>
        </div>
      </template>
    </UCard>
  </div>
</template>
