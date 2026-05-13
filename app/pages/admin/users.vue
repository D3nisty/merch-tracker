<script setup lang="ts">
import { useEventsStore } from '~/stores/events'
import { useAuthStore } from '~/stores/auth'
import { useLocale } from '~/composables/useLocale'
import type { AdminUser } from '~/stores/events'

definePageMeta({ layout: 'default' })

const store = useEventsStore()
const authStore = useAuthStore()
const { t } = useLocale()
const router = useRouter()

useHead({ title: 'Users' })

const users = ref<AdminUser[]>([])
const loading = ref(false)
const error = ref('')

// Create form
const showCreate = ref(false)
const newUser = reactive({ username: '', password: '', role: 'user' as 'admin' | 'editor' | 'user' })
const creating = ref(false)

// Inline edit (password reset / role change)
const editingId = ref<string | null>(null)
const editForm = reactive({ role: 'user' as 'admin' | 'editor' | 'user', password: '' })

// Delete confirm
const deleteTarget = ref<AdminUser | null>(null)

const roleOptions = computed(() => [
  { value: 'admin', label: t('sharing.roleAdmin') },
  { value: 'editor', label: t('sharing.roleEditor') },
  { value: 'user', label: t('sharing.roleUser') },
])

onMounted(async () => {
  if (!authStore.user) await authStore.fetchMe()
  if (!authStore.isAdmin) {
    router.replace('/')
    return
  }
  await refresh()
})

async function refresh() {
  loading.value = true
  try {
    users.value = await store.fetchAdminUsers()
  } catch (e: unknown) {
    error.value = (e as { data?: { message?: string } })?.data?.message ?? 'Failed to load users'
  } finally {
    loading.value = false
  }
}

async function create() {
  if (!newUser.username.trim() || newUser.password.length < 6) return
  creating.value = true
  error.value = ''
  try {
    await store.createAdminUser({ username: newUser.username.trim(), password: newUser.password, role: newUser.role })
    showCreate.value = false
    newUser.username = ''
    newUser.password = ''
    newUser.role = 'user'
    await refresh()
  } catch (e: unknown) {
    error.value = (e as { data?: { message?: string } })?.data?.message ?? 'Failed to create user'
  } finally {
    creating.value = false
  }
}

function startEdit(u: AdminUser) {
  editingId.value = u.id
  editForm.role = u.role
  editForm.password = ''
}

async function saveEdit(id: string) {
  error.value = ''
  try {
    const body: { role?: 'admin' | 'editor' | 'user'; password?: string } = { role: editForm.role }
    if (editForm.password) body.password = editForm.password
    await store.updateAdminUser(id, body)
    editingId.value = null
    await refresh()
  } catch (e: unknown) {
    error.value = (e as { data?: { message?: string } })?.data?.message ?? 'Failed to update'
  }
}

async function confirmDelete() {
  if (!deleteTarget.value) return
  error.value = ''
  try {
    await store.deleteAdminUser(deleteTarget.value.id)
    deleteTarget.value = null
    await refresh()
  } catch (e: unknown) {
    error.value = (e as { data?: { message?: string } })?.data?.message ?? 'Failed to delete'
  }
}

function roleColor(role: string) {
  if (role === 'admin') return 'red'
  if (role === 'editor') return 'purple'
  return 'gray'
}
</script>

<template>
  <div v-if="authStore.isAdmin">
    <div class="flex items-center justify-between mb-6 gap-2 flex-wrap">
      <div class="min-w-0">
        <NuxtLink to="/" class="text-gray-400 hover:text-white flex items-center gap-1 text-sm mb-1">
          <UIcon name="i-heroicons-arrow-left" class="w-4 h-4" /> {{ t('event.allEvents') }}
        </NuxtLink>
        <h1 class="text-2xl font-bold text-white">{{ t('nav.adminUsers') }}</h1>
      </div>
      <UButton color="purple" icon="i-heroicons-plus" @click="showCreate = true">{{ t('sharing.newUser') }}</UButton>
    </div>

    <p v-if="error" class="text-red-400 text-sm mb-3">{{ error }}</p>

    <UCard>
      <div v-if="loading" class="text-gray-500 text-sm">{{ t('common.loading') }}</div>
      <div v-else class="divide-y divide-gray-800">
        <div v-for="u in users" :key="u.id" class="py-3 first:pt-0 last:pb-0">
          <div v-if="editingId === u.id" class="space-y-2">
            <div class="flex items-center gap-2">
              <UIcon name="i-heroicons-user-circle" class="w-5 h-5 text-gray-400 shrink-0" />
              <span class="font-medium text-white">{{ u.username }}</span>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <UFormGroup :label="t('sharing.role')">
                <USelect v-model="editForm.role" :options="roleOptions" option-attribute="label" value-attribute="value" size="sm" />
              </UFormGroup>
              <UFormGroup :label="t('sharing.setPassword')">
                <UInput v-model="editForm.password" type="password" :placeholder="t('auth.newPassword')" size="sm" />
              </UFormGroup>
            </div>
            <div class="flex gap-2 justify-end">
              <UButton size="xs" variant="ghost" color="gray" @click="editingId = null">{{ t('common.cancel') }}</UButton>
              <UButton size="xs" color="purple" @click="saveEdit(u.id)">{{ t('common.save') }}</UButton>
            </div>
          </div>
          <div v-else class="flex items-center gap-3">
            <UIcon name="i-heroicons-user-circle" class="w-5 h-5 text-gray-400 shrink-0" />
            <div class="flex-1 min-w-0">
              <div class="font-medium text-white truncate">{{ u.username }}</div>
              <div class="text-xs text-gray-500">{{ new Date(u.createdAt).toLocaleDateString() }}</div>
            </div>
            <UBadge :label="t(`sharing.role${u.role.charAt(0).toUpperCase() + u.role.slice(1)}`)" :color="roleColor(u.role)" variant="soft" size="xs" />
            <UButton icon="i-heroicons-pencil-square" variant="ghost" color="gray" size="xs" @click="startEdit(u)" />
            <UButton
              v-if="u.id !== authStore.user?.id"
              icon="i-heroicons-trash" variant="ghost" color="red" size="xs"
              @click="deleteTarget = u"
            />
          </div>
        </div>
      </div>
    </UCard>

    <!-- Create modal -->
    <UModal v-model="showCreate" :ui="{ width: 'sm:max-w-sm' }">
      <UCard>
        <template #header><h3 class="font-semibold text-white">{{ t('sharing.newUser') }}</h3></template>
        <form class="space-y-3" @submit.prevent="create">
          <UFormGroup :label="t('nav.username')" required>
            <UInput v-model="newUser.username" autocomplete="off" autofocus />
          </UFormGroup>
          <UFormGroup :label="t('nav.password')" required>
            <UInput v-model="newUser.password" type="password" autocomplete="new-password" />
          </UFormGroup>
          <UFormGroup :label="t('sharing.role')">
            <USelect v-model="newUser.role" :options="roleOptions" option-attribute="label" value-attribute="value" />
          </UFormGroup>
        </form>
        <template #footer>
          <div class="flex gap-2 justify-end">
            <UButton variant="ghost" color="gray" @click="showCreate = false">{{ t('common.cancel') }}</UButton>
            <UButton color="purple" :loading="creating" :disabled="!newUser.username.trim() || newUser.password.length < 6" @click="create">{{ t('common.add') }}</UButton>
          </div>
        </template>
      </UCard>
    </UModal>

    <!-- Delete confirm -->
    <UModal :model-value="!!deleteTarget" @update:model-value="v => !v && (deleteTarget = null)" :ui="{ width: 'sm:max-w-sm' }">
      <UCard>
        <template #header><h3 class="font-semibold text-white">{{ t('sharing.deleteUser') }}</h3></template>
        <p class="text-gray-400 text-sm">{{ t('sharing.deleteUserConfirm') }}</p>
        <p v-if="deleteTarget" class="text-white font-medium mt-2">{{ deleteTarget.username }}</p>
        <template #footer>
          <div class="flex gap-2 justify-end">
            <UButton variant="ghost" color="gray" @click="deleteTarget = null">{{ t('common.cancel') }}</UButton>
            <UButton color="red" @click="confirmDelete">{{ t('common.delete') }}</UButton>
          </div>
        </template>
      </UCard>
    </UModal>
  </div>
</template>
