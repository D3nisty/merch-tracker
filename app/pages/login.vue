<script setup lang="ts">
import { useAuthStore } from '~/stores/auth'
import { useLocale } from '~/composables/useLocale'

// Full-bleed auth screen — no app shell.
definePageMeta({ layout: false })

const authStore = useAuthStore()
const { t } = useLocale()
const router = useRouter()
const route = useRoute()

// @ts-expect-error Nuxt auto-import
const colorMode = useColorMode()

useHead({ title: 'Sign in' })

const username = ref('')
const password = ref('')
const showPassword = ref(false)
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
  <div
    class="min-h-screen bg-app text-ink flex flex-col items-center justify-center px-6 py-10"
    style="background: radial-gradient(120% 80% at 50% 0%, #101a28 0%, var(--c-app) 60%);"
  >
    <!-- brand -->
    <div class="flex items-center gap-3 mb-7">
      <span class="w-11 h-11 rounded-[13px] grad-primary flex items-center justify-center">
        <UIcon name="i-heroicons-shopping-bag" class="w-6 h-6 text-on-accent" />
      </span>
      <span class="font-display font-bold text-[22px] text-ink-strong">merchtracker</span>
    </div>

    <!-- already signed in -->
    <div
      v-if="authStore.user?.username && authStore.user?.role"
      class="w-full max-w-[360px] mb-4 rounded-window border border-line-focus/60 bg-surface p-5"
    >
      <p class="text-sm text-muted">
        Signed in as <span class="font-semibold text-ink-strong">{{ authStore.user.username }}</span>
        <span class="text-xs text-faint ml-1">({{ authStore.user.role }})</span>
      </p>
      <div class="flex gap-2 pt-3">
        <NuxtLink :to="redirectTo" class="px-4 py-2 rounded-field grad-primary text-[13px] font-bold">Continue</NuxtLink>
        <button class="px-4 py-2 rounded-field text-[13px] font-semibold text-muted hover:text-ink" @click="logoutAndStay">{{ t('nav.logout') }}</button>
      </div>
    </div>

    <!-- login card -->
    <div class="w-full max-w-[360px] rounded-window border border-line bg-surface p-[26px] shadow-elevated">
      <h1 class="text-[19px] font-bold text-ink-strong mb-1">{{ t('auth.loginTitle') }}</h1>
      <p class="text-[13px] text-muted mb-5">{{ t('auth.loginSubtitle') }}</p>

      <form @submit.prevent="submit">
        <label class="block text-xs font-semibold text-muted mb-1.5">{{ t('nav.username') }}</label>
        <input
          v-model="username"
          autocomplete="username"
          autofocus
          class="w-full px-3.5 py-3 rounded-field border border-line bg-surface-2 text-sm text-ink outline-none focus:border-line-focus transition-colors mb-3.5"
        />

        <label class="block text-xs font-semibold text-muted mb-1.5">{{ t('nav.password') }}</label>
        <div class="relative mb-5">
          <input
            v-model="password"
            :type="showPassword ? 'text' : 'password'"
            autocomplete="current-password"
            class="w-full px-3.5 py-3 pr-11 rounded-field border border-line-focus bg-surface-2 text-sm text-ink outline-none focus:border-line-focus transition-colors"
          />
          <button
            type="button"
            class="absolute right-3 top-1/2 -translate-y-1/2 text-faint hover:text-muted"
            :aria-label="showPassword ? 'Hide password' : 'Show password'"
            @click="showPassword = !showPassword"
          >
            <UIcon :name="showPassword ? 'i-heroicons-eye-slash' : 'i-heroicons-eye'" class="w-4 h-4" />
          </button>
        </div>

        <p v-if="error" class="text-must text-xs mb-3">{{ error }}</p>

        <button
          type="submit"
          class="w-full py-3 rounded-[11px] grad-primary text-sm font-bold disabled:opacity-50 transition-opacity"
          :disabled="submitting || !username.trim() || !password"
        >
          {{ submitting ? '…' : t('nav.signIn') }}
        </button>
      </form>
    </div>

    <!-- language switch -->
    <div class="mt-6">
      <LanguageSelector />
    </div>
  </div>
</template>
