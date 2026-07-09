<script setup lang="ts">
import { useEventsStore } from '~/stores/events'
import { useAuthStore } from '~/stores/auth'
import { useLocale } from '~/composables/useLocale'
import type { BoothInviteIntrospection } from '~/stores/events'

definePageMeta({ layout: 'default' })

const route = useRoute()
const router = useRouter()
const store = useEventsStore()
const authStore = useAuthStore()
const { t } = useLocale()

useHead({ title: 'Booth invite' })

const token = computed(() => String(route.params.token))

const intro = ref<BoothInviteIntrospection | null>(null)
const loading = ref(true)
const error = ref('')

const newUsername = ref('')
const newPassword = ref('')
const submitting = ref(false)

onMounted(async () => {
  if (!authStore.user && !authStore.fetching) await authStore.fetchMe()
  try {
    intro.value = await store.introspectBoothInvite(token.value)
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

// Build a redirect path straight to the shared booth's detail page so the
// recipient lands where they can do their work. Prefer slugs over IDs for
// pretty URLs.
function targetPath(eventSlug: string | null, eventId: string | null, boothSlug: string | null, boothId: string): string {
  const ev = eventSlug ?? eventId ?? ''
  const bo = boothSlug ?? boothId
  return `/events/${ev}/booth/${bo}`
}

async function acceptWithCurrentUser() {
  submitting.value = true
  error.value = ''
  try {
    const result = await store.acceptBoothInvite(token.value)
    await authStore.fetchMe()
    router.replace(targetPath(
      intro.value?.event.slug ?? null,
      result.eventId,
      intro.value?.booth.slug ?? result.boothSlug,
      result.boothId,
    ))
  } catch (e) {
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
    const result = await store.acceptBoothInvite(token.value, {
      username: newUsername.value.trim(),
      password: newPassword.value,
    })
    await authStore.fetchMe()
    router.replace(targetPath(
      intro.value?.event.slug ?? null,
      result.eventId,
      intro.value?.booth.slug ?? result.boothSlug,
      result.boothId,
    ))
  } catch (e) {
    error.value = (e as { data?: { message?: string } })?.data?.message ?? 'Failed to create account'
  } finally {
    submitting.value = false
  }
}

const levelColor = computed(() => intro.value?.level === 'edit' ? 'primary' : 'gray')
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
        <h1 class="font-bold text-white text-lg">{{ t('boothShare.inviteTitle') }}</h1>
        <p class="text-sm text-gray-400 mt-0.5">{{ t('boothShare.inviteSubtitle') }}</p>
      </template>

      <!-- Booth + event summary -->
      <div class="rounded-lg border border-gray-800 bg-gray-900 p-3 mb-4">
        <div class="flex items-center gap-2 mb-1">
          <UBadge :label="intro.event.type === 'convention' ? t('events.convention') : t('events.travelType')"
            :color="intro.event.type === 'convention' ? 'indigo' : 'primary'" variant="soft" size="xs" />
          <UBadge :label="intro.level === 'edit' ? t('boothShare.levelEdit') : t('boothShare.levelView')"
            :color="levelColor" variant="soft" size="xs" />
        </div>
        <h2 class="text-xl font-bold text-white">{{ intro.booth.name }}</h2>
        <p class="text-gray-400 text-sm mt-1">
          <span class="text-gray-500">{{ t('boothShare.atEvent') }}</span> {{ intro.event.name }}
          <span v-if="intro.event.location"> · {{ intro.event.location }}</span>
        </p>
      </div>

      <div v-if="authStore.isLoggedIn" class="space-y-2">
        <p class="text-sm text-gray-400">
          {{ t('sharing.inviteAcceptAs') }}
          <span class="text-white font-medium">{{ authStore.user?.username }}</span>
        </p>
        <UButton color="primary" block icon="i-heroicons-arrow-right" :loading="submitting" @click="acceptWithCurrentUser">
          {{ t('sharing.inviteJoin') }}
        </UButton>
      </div>

      <div v-else class="space-y-3">
        <p class="text-sm text-gray-400">{{ t('sharing.inviteSignup') }}</p>
        <UFormGroup :label="t('nav.username')" required>
          <UInput v-model="newUsername" autocomplete="username" autofocus />
        </UFormGroup>
        <UFormGroup :label="t('nav.password')" required>
          <UInput v-model="newPassword" type="password" autocomplete="new-password" />
        </UFormGroup>
        <UButton
          color="primary" block icon="i-heroicons-arrow-right"
          :loading="submitting"
          :disabled="!newUsername.trim() || newPassword.length < 6"
          @click="acceptAsNewUser"
        >{{ t('sharing.inviteJoin') }}</UButton>

        <div class="text-center text-xs text-gray-500 pt-2">
          {{ t('sharing.inviteSignin') }}
          <NuxtLink :to="`/login?redirect=${encodeURIComponent('/booth-invite/' + token)}`"
            class="text-purple-400 hover:text-purple-300 underline">
            {{ t('nav.login') }}
          </NuxtLink>
        </div>
      </div>

      <p v-if="error" class="text-red-400 text-xs mt-3">{{ error }}</p>
    </UCard>
  </div>
</template>
