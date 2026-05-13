<script setup lang="ts">
import { useAuthStore } from '~/stores/auth'
import { useLocale } from '~/composables/useLocale'

definePageMeta({ layout: 'default' })

const authStore = useAuthStore()
const { t } = useLocale()
const router = useRouter()
const route = useRoute()

const username = ref('')
const password = ref('')
const error = ref('')
const submitting = ref(false)

const redirectTo = computed(() =>
  typeof route.query.redirect === 'string' && route.query.redirect.startsWith('/') ? route.query.redirect : '/',
)

onMounted(async () => {
  if (!authStore.user && !authStore.fetching) await authStore.fetchMe()
})

async function submit() {
  if (!username.value.trim() || !password.value) return
  submitting.value = true
  error.value = ''
  const res = await authStore.login(username.value.trim(), password.value)
  submitting.value = false
  if (res.ok) {
    router.replace(redirectTo.value)
  } else {
    error.value = res.message || t('auth.invalidCredentials')
  }
}

async function logoutAndStay() {
  await authStore.logout()
  username.value = ''
  password.value = ''
  error.value = ''
}
</script>

<template>
  <div class="max-w-sm mx-auto mt-12">
    <!-- Already-logged-in banner -->
    <UCard v-if="authStore.isLoggedIn" class="mb-4 border-purple-500/40">
      <div class="space-y-1">
        <p class="text-sm text-gray-300">
          Signed in as <span class="font-semibold text-white">{{ authStore.user?.username || '(no username)' }}</span>
          <span class="text-xs text-gray-500 ml-1">({{ authStore.user?.role || 'unknown role' }})</span>
        </p>
        <div class="flex gap-2 pt-2">
          <UButton size="sm" color="purple" :to="redirectTo">Continue</UButton>
          <UButton size="sm" variant="ghost" color="gray" @click="logoutAndStay">{{ t('nav.logout') }}</UButton>
        </div>
      </div>
    </UCard>

    <UCard>
      <template #header>
        <h1 class="font-bold text-white text-lg">{{ t('auth.loginTitle') }}</h1>
        <p class="text-sm text-gray-400 mt-0.5">{{ t('auth.loginSubtitle') }}</p>
      </template>

      <form class="space-y-3" @submit.prevent="submit">
        <div>
          <label class="block text-xs text-gray-400 mb-1">{{ t('nav.username') }}</label>
          <UInput v-model="username" autocomplete="username" autofocus />
        </div>
        <div>
          <label class="block text-xs text-gray-400 mb-1">{{ t('nav.password') }}</label>
          <UInput v-model="password" type="password" autocomplete="current-password" />
        </div>
        <p v-if="error" class="text-red-400 text-xs">{{ error }}</p>
      </form>

      <template #footer>
        <div class="flex justify-end">
          <UButton color="purple" :loading="submitting" :disabled="!username.trim() || !password" @click="submit">
            {{ t('nav.login') }}
          </UButton>
        </div>
      </template>
    </UCard>
  </div>
</template>
