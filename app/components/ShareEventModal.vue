<script setup lang="ts">
import { useEventsStore } from '~/stores/events'
import { useAuthStore } from '~/stores/auth'
import type { Event, BasicUser, Group, EventShares, EventInvite } from '~/stores/events'
import { useLocale } from '~/composables/useLocale'

const props = defineProps<{
  modelValue: boolean
  event: Event
}>()
const emit = defineEmits<{ 'update:modelValue': [v: boolean] }>()

const store = useEventsStore()
const authStore = useAuthStore()
const { t } = useLocale()

const shares = ref<EventShares>({ users: [], groups: [] })
const allUsers = ref<BasicUser[]>([])
const allGroups = ref<Group[]>([])
const invites = ref<EventInvite[]>([])
const loading = ref(false)
const error = ref('')

// Add-share form state
const targetType = ref<'user' | 'group'>('user')
const targetId = ref('')
const level = ref<'view' | 'edit'>('view')
const submitting = ref(false)

// Invite form state
const inviteLevel = ref<'view' | 'edit'>('view')
const inviteHours = ref<string>('')
const inviteSubmitting = ref(false)
const copiedToken = ref<string | null>(null)

const eventKey = computed(() => props.event.slug ?? props.event.id)

// Only the owner or an admin manages shares — same check controls invite mgmt.
const canManage = computed(() => authStore.isAdmin || props.event.ownerId === authStore.user?.id)

async function refresh() {
  loading.value = true
  error.value = ''
  try {
    const tasks: Promise<unknown>[] = [
      store.fetchEventShares(eventKey.value).then(s => { shares.value = s }),
      store.fetchUsers().then(u => { allUsers.value = u }),
      store.fetchGroups().then(g => { allGroups.value = g }),
    ]
    if (canManage.value) {
      tasks.push(store.fetchEventInvites(eventKey.value).then(i => { invites.value = i }))
    }
    await Promise.all(tasks)
  } catch (e: unknown) {
    error.value = (e as { data?: { message?: string } })?.data?.message ?? 'Failed to load shares'
  } finally {
    loading.value = false
  }
}

watch(() => props.modelValue, (open) => {
  if (open) refresh()
}, { immediate: true })

// Hide users who are already shared with, plus the owner themselves
const userOptions = computed(() => {
  const sharedIds = new Set(shares.value.users.map(s => s.userId))
  return allUsers.value
    .filter(u => !sharedIds.has(u.id) && u.id !== props.event.ownerId)
    .map(u => ({
      value: u.id,
      label: u.name && u.name !== u.username ? `${u.name} (@${u.username})` : u.username,
    }))
})

const groupOptions = computed(() => {
  const sharedIds = new Set(shares.value.groups.map(s => s.groupId))
  return allGroups.value
    .filter(g => !sharedIds.has(g.id))
    .map(g => ({ value: g.id, label: `${g.name} (${g.memberCount})` }))
})

const levelOptions = computed(() => [
  { value: 'view', label: t('sharing.levelView') },
  { value: 'edit', label: t('sharing.levelEdit') },
])

async function addShare() {
  if (!targetId.value) return
  submitting.value = true
  error.value = ''
  try {
    if (targetType.value === 'user') {
      await store.shareEventWithUser(eventKey.value, targetId.value, level.value)
    } else {
      await store.shareEventWithGroup(eventKey.value, targetId.value, level.value)
    }
    targetId.value = ''
    await refresh()
  } catch (e: unknown) {
    error.value = (e as { data?: { message?: string } })?.data?.message ?? 'Failed to share'
  } finally {
    submitting.value = false
  }
}

async function removeShare(shareId: string) {
  try {
    await store.removeShare(eventKey.value, shareId)
    await refresh()
  } catch (e: unknown) {
    error.value = (e as { data?: { message?: string } })?.data?.message ?? 'Failed to revoke'
  }
}

function inviteUrl(token: string) {
  if (typeof window === 'undefined') return `/invite/${token}`
  return `${window.location.origin}/invite/${token}`
}

async function createInvite() {
  inviteSubmitting.value = true
  error.value = ''
  try {
    const hours = inviteHours.value ? Number(inviteHours.value) : undefined
    await store.createInvite(eventKey.value, inviteLevel.value, hours)
    inviteHours.value = ''
    await refresh()
  } catch (e: unknown) {
    error.value = (e as { data?: { message?: string } })?.data?.message ?? 'Failed to create invite'
  } finally {
    inviteSubmitting.value = false
  }
}

async function revokeInvite(inviteId: string) {
  try {
    await store.revokeInvite(eventKey.value, inviteId)
    await refresh()
  } catch (e: unknown) {
    error.value = (e as { data?: { message?: string } })?.data?.message ?? 'Failed to revoke invite'
  }
}

async function copyInvite(token: string) {
  try {
    await navigator.clipboard.writeText(inviteUrl(token))
    copiedToken.value = token
    setTimeout(() => { if (copiedToken.value === token) copiedToken.value = null }, 2000)
  } catch { /* clipboard blocked */ }
}
</script>

<template>
  <UModal :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)" :ui="{ width: 'sm:max-w-lg' }">
    <UCard>
      <template #header>
        <h3 class="font-bold text-white text-lg">{{ t('sharing.shareEvent') }} — {{ event.name }}</h3>
      </template>

      <div class="space-y-4">
        <!-- Public state -->
        <div class="flex items-center gap-2 text-sm px-3 py-2 rounded-lg"
          :class="event.isPublic ? 'bg-green-500/10 text-green-300' : 'bg-gray-800 text-gray-400'">
          <UIcon :name="event.isPublic ? 'i-heroicons-globe-alt' : 'i-heroicons-lock-closed'" class="w-4 h-4" />
          {{ event.isPublic ? t('sharing.publicEvent') : t('sharing.private') }}
        </div>

        <!-- Add share form -->
        <div v-if="canManage" class="space-y-2 border border-gray-800 rounded-lg p-3">
          <div class="flex gap-1 p-1 rounded-md bg-gray-900">
            <button
              type="button"
              class="flex-1 px-2 py-1 text-xs rounded transition-colors"
              :class="targetType === 'user' ? 'bg-gray-800 text-white' : 'text-gray-400 hover:text-white'"
              @click="targetType = 'user'; targetId = ''"
            >{{ t('sharing.user') }}</button>
            <button
              type="button"
              class="flex-1 px-2 py-1 text-xs rounded transition-colors"
              :class="targetType === 'group' ? 'bg-gray-800 text-white' : 'text-gray-400 hover:text-white'"
              @click="targetType = 'group'; targetId = ''"
            >{{ t('sharing.group') }}</button>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-[1fr_120px_auto] gap-2 items-start">
            <USelect
              v-if="targetType === 'user'"
              v-model="targetId"
              :options="userOptions"
              option-attribute="label"
              value-attribute="value"
              :placeholder="t('sharing.pickUser')"
              size="sm"
            />
            <USelect
              v-else
              v-model="targetId"
              :options="groupOptions"
              option-attribute="label"
              value-attribute="value"
              :placeholder="t('sharing.pickGroup')"
              size="sm"
            />
            <USelect
              v-model="level"
              :options="levelOptions"
              option-attribute="label"
              value-attribute="value"
              size="sm"
            />
            <UButton
              color="purple"
              size="sm"
              icon="i-heroicons-plus"
              :disabled="!targetId"
              :loading="submitting"
              block
              @click="addShare"
            >{{ t('common.add') }}</UButton>
          </div>
        </div>

        <!-- Current shares -->
        <div>
          <div class="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">{{ t('sharing.sharedWith') }}</div>
          <div v-if="loading" class="text-sm text-gray-500">{{ t('common.loading') }}</div>
          <div v-else-if="shares.users.length === 0 && shares.groups.length === 0" class="text-sm text-gray-500 italic">
            {{ t('sharing.noShares') }}
          </div>
          <div v-else class="space-y-1.5">
            <div v-for="s in shares.users" :key="s.id"
              class="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-900 border border-gray-800">
              <UIcon name="i-heroicons-user" class="w-4 h-4 text-gray-400" />
              <div class="flex-1 min-w-0">
                <div class="text-sm text-white truncate">{{ s.name || s.username }}</div>
                <div v-if="s.name && s.name !== s.username" class="text-xs text-gray-500 truncate">@{{ s.username }}</div>
              </div>
              <UBadge
                :label="s.level === 'edit' ? t('sharing.levelEdit') : t('sharing.levelView')"
                :color="s.level === 'edit' ? 'purple' : 'gray'"
                variant="soft" size="xs"
              />
              <UButton
                v-if="canManage"
                icon="i-heroicons-x-mark"
                variant="ghost" color="red" size="xs"
                :title="t('sharing.revoke')"
                @click="removeShare(s.id)"
              />
            </div>
            <div v-for="s in shares.groups" :key="s.id"
              class="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-900 border border-gray-800">
              <UIcon name="i-heroicons-user-group" class="w-4 h-4 text-gray-400" />
              <span class="text-sm text-white flex-1 truncate">{{ s.groupName }}</span>
              <UBadge
                :label="s.level === 'edit' ? t('sharing.levelEdit') : t('sharing.levelView')"
                :color="s.level === 'edit' ? 'purple' : 'gray'"
                variant="soft" size="xs"
              />
              <UButton
                v-if="canManage"
                icon="i-heroicons-x-mark"
                variant="ghost" color="red" size="xs"
                :title="t('sharing.revoke')"
                @click="removeShare(s.id)"
              />
            </div>
          </div>
        </div>

        <!-- Invite links — owner/admin only -->
        <div v-if="canManage" class="border-t border-gray-800 pt-4">
          <div class="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">{{ t('sharing.inviteLinks') }}</div>
          <p class="text-xs text-gray-500 mb-2">{{ t('sharing.inviteLinksDesc') }}</p>

          <!-- Create form -->
          <div class="grid grid-cols-2 sm:grid-cols-[1fr_120px_auto] gap-2 items-end mb-2">
            <UFormGroup :label="t('sharing.inviteLevel')" class="col-span-2 sm:col-span-1">
              <USelect
                v-model="inviteLevel"
                :options="levelOptions"
                option-attribute="label"
                value-attribute="value"
                size="sm"
              />
            </UFormGroup>
            <UFormGroup :label="t('sharing.inviteExpiry')">
              <UInput
                v-model="inviteHours"
                type="number"
                size="sm"
                placeholder="—"
                min="1"
              />
            </UFormGroup>
            <UButton
              color="purple"
              size="sm"
              icon="i-heroicons-link"
              :loading="inviteSubmitting"
              block
              @click="createInvite"
            >{{ t('sharing.createInviteLink') }}</UButton>
          </div>
          <p class="text-xs text-gray-600 mb-3">{{ t('sharing.inviteExpiryHint') }}</p>

          <!-- Existing invites -->
          <div v-if="invites.length === 0" class="text-sm text-gray-500 italic">{{ t('sharing.noShares') }}</div>
          <div v-else class="space-y-1.5">
            <div v-for="inv in invites" :key="inv.id"
              class="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-900 border border-gray-800">
              <UIcon name="i-heroicons-link" class="w-4 h-4 text-gray-400 shrink-0" />
              <div class="flex-1 min-w-0">
                <code class="text-xs text-purple-300 truncate block">{{ inviteUrl(inv.token) }}</code>
                <div class="text-xs text-gray-500 mt-0.5">
                  {{ inv.expiresAt ? t('sharing.inviteExpires') + ' ' + new Date(inv.expiresAt).toLocaleString() : t('sharing.inviteNever') }}
                </div>
              </div>
              <UBadge
                :label="inv.level === 'edit' ? t('sharing.levelEdit') : t('sharing.levelView')"
                :color="inv.level === 'edit' ? 'purple' : 'gray'"
                variant="soft" size="xs"
              />
              <UButton
                :icon="copiedToken === inv.token ? 'i-heroicons-check' : 'i-heroicons-clipboard'"
                variant="ghost" :color="copiedToken === inv.token ? 'green' : 'gray'" size="xs"
                :title="copiedToken === inv.token ? t('sharing.inviteCopied') : t('sharing.inviteCopy')"
                @click="copyInvite(inv.token)"
              />
              <UButton
                icon="i-heroicons-x-mark"
                variant="ghost" color="red" size="xs"
                :title="t('sharing.revoke')"
                @click="revokeInvite(inv.id)"
              />
            </div>
          </div>
        </div>

        <p v-if="error" class="text-red-400 text-xs">{{ error }}</p>
      </div>

      <template #footer>
        <div class="flex justify-end">
          <UButton variant="ghost" color="gray" @click="emit('update:modelValue', false)">{{ t('common.close') }}</UButton>
        </div>
      </template>
    </UCard>
  </UModal>
</template>
