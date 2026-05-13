<script setup lang="ts">
import { useAuthStore } from '~/stores/auth'
import { useLocale } from '~/composables/useLocale'

definePageMeta({ layout: 'default' })

const authStore = useAuthStore()
const { t } = useLocale()
const router = useRouter()

const currentPassword = ref('')
const newPassword = ref('')
const error = ref('')
const success = ref(false)
const submitting = ref(false)

onMounted(async () => {
  if (!authStore.user) await authStore.fetchMe()
  if (!authStore.isLoggedIn) router.replace('/login?redirect=/account')
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
