<script setup lang="ts">
import { useEventsStore } from '~/stores/events'
import { useAuthStore } from '~/stores/auth'
import { useLocale } from '~/composables/useLocale'
import type { InviteIntrospection } from '~/stores/events'

definePageMeta({ layout: 'default' })

const route = useRoute()
const router = useRouter()
const store = useEventsStore()
const authStore = useAuthStore()
const { t } = useLocale()

const token = computed(() => String(route.params.token))

const intro = ref<InviteIntrospection | null>(null)
const loading = ref(true)
const error = ref('')

// Signup form (used when logged out)
const newUsername = ref('')
const newPassword = ref('')
const submitting = ref(false)

onMounted(async () => {
  if (!authStore.user && !authStore.fetching) await authStore.fetchMe()
  try {
    intro.value = await store.introspectInvite(token.value)
  } catch (e: unknown) {
    const status = (e as { statusCode?: number })?.statusCode
    if (status === 404 || status === 410) {
      error.value = t('sharing.inviteExpired')
    } else {
      error.value = (e as { data?: { message?: string } })?.data?.message ?? 'Failed to load invite'
    }
  } finally {
    loading.value = false
  }
})

async function acceptWithCurrentUser() {
  submitting.value = true
  error.value = ''
  try {
    const result = await store.acceptInvite(token.value)
    // Refresh local user state in case anything changed
    await authStore.fetchMe()
    // Use slug if available so the URL is pretty
    const slug = intro.value?.event.slug ?? result.eventId
    router.replace(`/events/${slug}`)
  } catch (e: unknown) {
    error.value = (e as { data?: { message?: string } })?.data?.message ?? 'Failed to accept'
  } finally {
    submitting.value = false
  }
}

async function acceptAsNewUser() {
  if (!newUsername.value.trim() || newPassword.value.length < 6) return
  submitting.value = true
  error.value = ''
  try {
    const result = await store.acceptInvite(token.value, {
      username: newUsername.value.trim(),
      password: newPassword.value,
    })
    await authStore.fetchMe()
    const slug = intro.value?.event.slug ?? result.eventId
    router.replace(`/events/${slug}`)
  } catch (e: unknown) {
    error.value = (e as { data?: { message?: string } })?.data?.message ?? 'Failed to create account'
  } finally {
    submitting.value = false
  }
}

const levelColor = computed(() => intro.value?.level === 'edit' ? 'purple' : 'gray')
</script>

<template>
  <div class="max-w-md mx-auto mt-12">
    <div v-if="loading" class="text-center text-gray-500 py-10">{{ t('common.loading') }}</div>

    <UCard v-else-if="error && !intro" class="border-red-500/40">
      <div class="text-center space-y-3 py-3">
        <UIcon name="i-heroicons-no-symbol" class="w-10 h-10 text-red-400 mx-auto" />
        <p class="text-white font-medium">{{ error }}</p>
        <UButton to="/" variant="ghost" color="gray">{{ t('event.allEvents') }}</UButton>
      </div>
    </UCard>

    <UCard v-else-if="intro">
      <template #header>
        <h1 class="font-bold text-white text-lg">{{ t('sharing.inviteTitle') }}</h1>
        <p class="text-sm text-gray-400 mt-0.5">{{ t('sharing.inviteSubtitle') }}</p>
      </template>

      <!-- Event summary -->
      <div class="rounded-lg border border-gray-800 bg-gray-900 p-3 mb-4">
        <div class="flex items-center gap-2 mb-1">
          <UBadge :label="intro.event.type === 'convention' ? t('events.convention') : t('events.travelType')"
            :color="intro.event.type === 'convention' ? 'purple' : 'blue'" variant="soft" size="xs" />
          <UBadge :label="intro.level === 'edit' ? t('sharing.levelEdit') : t('sharing.levelView')"
            :color="levelColor" variant="soft" size="xs" />
        </div>
        <h2 class="text-xl font-bold text-white">{{ intro.event.name }}</h2>
        <p v-if="intro.event.location" class="text-gray-400 text-sm mt-1">{{ intro.event.location }}</p>
      </div>

      <!-- Logged-in path -->
      <div v-if="authStore.isLoggedIn" class="space-y-2">
        <p class="text-sm text-gray-400">{{ t('sharing.inviteAcceptAs') }} <span class="text-white font-medium">{{ authStore.user?.username }}</span></p>
        <UButton color="purple" block icon="i-heroicons-arrow-right" :loading="submitting" @click="acceptWithCurrentUser">
          {{ t('sharing.inviteJoin') }}
        </UButton>
      </div>

      <!-- Logged-out: signup-via-invite -->
      <div v-else class="space-y-3">
        <p class="text-sm text-gray-400">{{ t('sharing.inviteSignup') }}</p>
        <UFormGroup :label="t('nav.username')" required>
          <UInput v-model="newUsername" autocomplete="username" autofocus />
        </UFormGroup>
        <UFormGroup :label="t('nav.password')" required>
          <UInput v-model="newPassword" type="password" autocomplete="new-password" />
        </UFormGroup>
        <UButton
          color="purple" block icon="i-heroicons-arrow-right"
          :loading="submitting"
          :disabled="!newUsername.trim() || newPassword.length < 6"
          @click="acceptAsNewUser"
        >{{ t('sharing.inviteJoin') }}</UButton>

        <div class="text-center text-xs text-gray-500 pt-2">
          {{ t('sharing.inviteSignin') }}
          <NuxtLink :to="`/login?redirect=${encodeURIComponent('/invite/' + token)}`" class="text-purple-400 hover:text-purple-300 underline">
            {{ t('nav.login') }}
          </NuxtLink>
        </div>
      </div>

      <p v-if="error" class="text-red-400 text-xs mt-3">{{ error }}</p>
    </UCard>
  </div>
</template>
