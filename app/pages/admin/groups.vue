<script setup lang="ts">
import { useEventsStore } from '~/stores/events'
import { useAuthStore } from '~/stores/auth'
import { useLocale } from '~/composables/useLocale'
import type { Group, GroupMember, BasicUser } from '~/stores/events'

definePageMeta({ layout: 'default' })

const store = useEventsStore()
const authStore = useAuthStore()
const { t } = useLocale()
const router = useRouter()

useHead({ title: 'Groups' })

const groups = ref<Group[]>([])
const allUsers = ref<BasicUser[]>([])
const loading = ref(false)
const error = ref('')

const showCreate = ref(false)
const newGroupName = ref('')
const creating = ref(false)

const expandedId = ref<string | null>(null)
const members = ref<Record<string, GroupMember[]>>({})
const addingMember = ref<string | null>(null)
const memberSelectId = ref('')

const deleteTarget = ref<Group | null>(null)

onMounted(async () => {
  if (!authStore.user) await authStore.fetchMe()
  if (!authStore.isLoggedIn) {
    router.replace('/login?redirect=/admin/groups')
    return
  }
  await refresh()
  try { allUsers.value = await store.fetchUsers() } catch {}
})

async function refresh() {
  loading.value = true
  try {
    groups.value = await store.fetchGroups()
  } catch (e: unknown) {
    error.value = (e as { data?: { message?: string } })?.data?.message ?? 'Failed to load groups'
  } finally {
    loading.value = false
  }
}

async function create() {
  if (!newGroupName.value.trim()) return
  creating.value = true
  error.value = ''
  try {
    await store.createGroup(newGroupName.value.trim())
    showCreate.value = false
    newGroupName.value = ''
    await refresh()
  } catch (e: unknown) {
    error.value = (e as { data?: { message?: string } })?.data?.message ?? 'Failed to create'
  } finally {
    creating.value = false
  }
}

async function toggleExpand(group: Group) {
  if (expandedId.value === group.id) {
    expandedId.value = null
    return
  }
  expandedId.value = group.id
  if (!members.value[group.id]) {
    try {
      members.value[group.id] = await store.fetchGroupMembers(group.id)
    } catch (e: unknown) {
      error.value = (e as { data?: { message?: string } })?.data?.message ?? 'Failed to load members'
    }
  }
}

async function addMember(groupId: string) {
  if (!memberSelectId.value) return
  error.value = ''
  try {
    await store.addGroupMember(groupId, memberSelectId.value)
    members.value[groupId] = await store.fetchGroupMembers(groupId)
    memberSelectId.value = ''
    addingMember.value = null
    await refresh()  // memberCount changed
  } catch (e: unknown) {
    error.value = (e as { data?: { message?: string } })?.data?.message ?? 'Failed to add member'
  }
}

async function removeMember(groupId: string, memberId: string) {
  try {
    await store.removeGroupMember(groupId, memberId)
    members.value[groupId] = await store.fetchGroupMembers(groupId)
    await refresh()
  } catch (e: unknown) {
    error.value = (e as { data?: { message?: string } })?.data?.message ?? 'Failed to remove member'
  }
}

async function confirmDelete() {
  if (!deleteTarget.value) return
  try {
    await store.deleteGroup(deleteTarget.value.id)
    deleteTarget.value = null
    await refresh()
  } catch (e: unknown) {
    error.value = (e as { data?: { message?: string } })?.data?.message ?? 'Failed to delete'
  }
}

function userOptionsFor(groupId: string) {
  const memberIds = new Set((members.value[groupId] ?? []).map(m => m.userId))
  return allUsers.value
    .filter(u => !memberIds.has(u.id))
    .map(u => ({ value: u.id, label: u.username }))
}

function canManageGroup(g: Group) {
  return authStore.isAdmin || g.ownerId === authStore.user?.id
}
</script>

<template>
  <div v-if="authStore.isLoggedIn">
    <div class="flex items-center justify-between mb-6 gap-2 flex-wrap">
      <div class="min-w-0">
        <NuxtLink to="/" class="text-gray-400 hover:text-white flex items-center gap-1 text-sm mb-1">
          <UIcon name="i-heroicons-arrow-left" class="w-4 h-4" /> {{ t('event.allEvents') }}
        </NuxtLink>
        <h1 class="text-2xl font-bold text-white">{{ t('nav.adminGroups') }}</h1>
      </div>
      <UButton color="primary" icon="i-heroicons-plus" @click="showCreate = true">{{ t('sharing.newGroup') }}</UButton>
    </div>

    <p v-if="error" class="text-red-400 text-sm mb-3">{{ error }}</p>

    <div v-if="loading" class="text-gray-500 text-sm">{{ t('common.loading') }}</div>
    <div v-else-if="groups.length === 0" class="text-gray-500 text-sm text-center py-8">
      No groups yet.
    </div>

    <div v-else class="space-y-3">
      <UCard v-for="g in groups" :key="g.id">
        <div class="flex items-center gap-3 cursor-pointer" @click="toggleExpand(g)">
          <UIcon :name="expandedId === g.id ? 'i-heroicons-chevron-down' : 'i-heroicons-chevron-right'" class="w-4 h-4 text-gray-400" />
          <UIcon name="i-heroicons-user-group" class="w-5 h-5 text-purple-400" />
          <div class="flex-1 min-w-0">
            <div class="font-medium text-white truncate">{{ g.name }}</div>
            <div class="text-xs text-gray-500">{{ g.memberCount }} {{ t('sharing.groupMembers') }}</div>
          </div>
          <UButton
            v-if="canManageGroup(g)"
            icon="i-heroicons-trash"
            variant="ghost" color="red" size="xs"
            @click.stop="deleteTarget = g"
          />
        </div>

        <!-- Expanded members panel -->
        <div v-if="expandedId === g.id" class="mt-4 pt-4 border-t border-gray-800 space-y-2">
          <div v-if="(members[g.id] ?? []).length === 0" class="text-sm text-gray-500 italic">{{ t('sharing.noMembers') }}</div>
          <div v-for="m in (members[g.id] ?? [])" :key="m.id"
            class="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-900 border border-gray-800">
            <UIcon name="i-heroicons-user" class="w-4 h-4 text-gray-400" />
            <span class="text-sm text-white flex-1 truncate">{{ m.username }}</span>
            <UButton
              v-if="canManageGroup(g) || m.userId === authStore.user?.id"
              icon="i-heroicons-x-mark"
              variant="ghost" color="red" size="xs"
              :title="m.userId === authStore.user?.id && !canManageGroup(g) ? t('sharing.leaveGroup') : t('sharing.revoke')"
              @click="removeMember(g.id, m.id)"
            />
          </div>

          <div v-if="canManageGroup(g) && addingMember === g.id" class="flex gap-2">
            <USelect
              v-model="memberSelectId"
              :options="userOptionsFor(g.id)"
              option-attribute="label"
              value-attribute="value"
              :placeholder="t('sharing.pickUser')"
              size="sm"
              class="flex-1"
            />
            <UButton color="primary" size="sm" icon="i-heroicons-plus" :disabled="!memberSelectId" @click="addMember(g.id)">{{ t('common.add') }}</UButton>
            <UButton size="sm" variant="ghost" color="gray" @click="addingMember = null; memberSelectId = ''">{{ t('common.cancel') }}</UButton>
          </div>
          <UButton
            v-else-if="canManageGroup(g)"
            size="xs" variant="soft" color="primary"
            icon="i-heroicons-plus"
            @click="addingMember = g.id; memberSelectId = ''"
          >{{ t('sharing.addMember') }}</UButton>
        </div>
      </UCard>
    </div>

    <!-- Create modal -->
    <UModal v-model="showCreate" :ui="{ width: 'sm:max-w-sm' }">
      <UCard>
        <template #header><h3 class="font-semibold text-white">{{ t('sharing.newGroup') }}</h3></template>
        <UFormGroup :label="t('sharing.groupName')" required>
          <UInput v-model="newGroupName" :placeholder="t('sharing.groupNamePlaceholder')" autofocus @keydown.enter="create" />
        </UFormGroup>
        <template #footer>
          <div class="flex gap-2 justify-end">
            <UButton variant="ghost" color="gray" @click="showCreate = false">{{ t('common.cancel') }}</UButton>
            <UButton color="primary" :loading="creating" :disabled="!newGroupName.trim()" @click="create">{{ t('common.add') }}</UButton>
          </div>
        </template>
      </UCard>
    </UModal>

    <!-- Delete confirm -->
    <UModal :model-value="!!deleteTarget" @update:model-value="v => !v && (deleteTarget = null)" :ui="{ width: 'sm:max-w-sm' }">
      <UCard>
        <template #header><h3 class="font-semibold text-white">{{ t('sharing.deleteGroup') }}</h3></template>
        <p class="text-gray-400 text-sm">{{ t('sharing.deleteGroupConfirm') }}</p>
        <p v-if="deleteTarget" class="text-white font-medium mt-2">{{ deleteTarget.name }}</p>
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
