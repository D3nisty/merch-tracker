<script setup lang="ts">
import { useEventsStore } from '~/stores/events'
import { useAuthStore } from '~/stores/auth'
import type { Event, Booth, BasicUser, Group, BoothShares, BoothInvite } from '~/stores/events'
import { useLocale } from '~/composables/useLocale'

const props = defineProps<{
  modelValue: boolean
  booth: Booth
  event: Event
}>()
const emit = defineEmits<{ 'update:modelValue': [v: boolean] }>()

const store = useEventsStore()
const authStore = useAuthStore()
const { t } = useLocale()

const shares = ref<BoothShares>({ users: [], groups: [] })
const allUsers = ref<BasicUser[]>([])
const allGroups = ref<Group[]>([])
const invites = ref<BoothInvite[]>([])
const loading = ref(false)
const error = ref('')

// Single add-share form — pick whether to share with a user or a group, then
// the relevant select gets populated. Mirrors the ShareEventModal pattern.
const targetType = ref<'user' | 'group'>('user')
const targetId = ref('')
const level = ref<'view' | 'edit'>('edit')
const submitting = ref(false)

// Invite-mint form
const inviteLevel = ref<'view' | 'edit'>('edit')
const inviteHours = ref<string>('')
const inviteSubmitting = ref(false)
const copiedToken = ref<string | null>(null)

// Only the event owner or an admin can grant booth shares — collaborators
// who themselves only have booth-edit can't re-share onward.
const canManage = computed(() => authStore.isAdmin || props.event.ownerId === authStore.user?.id)

const COLOR_MAP: Record<string, string> = {
  purple: 'bg-purple-500', blue: 'bg-blue-500', green: 'bg-green-500',
  yellow: 'bg-yellow-500', red: 'bg-red-500', pink: 'bg-pink-500',
  orange: 'bg-orange-500', teal: 'bg-teal-500',
}

async function refresh() {
  loading.value = true
  error.value = ''
  try {
    const tasks: Promise<unknown>[] = [
      store.fetchBoothShares(props.booth.id).then(s => { shares.value = s }),
    ]
    if (canManage.value) {
      tasks.push(store.fetchUsers().then(u => { allUsers.value = u }))
      tasks.push(store.fetchGroups().then(g => { allGroups.value = g }))
      tasks.push(store.fetchBoothInvites(props.booth.id).then(i => { invites.value = i }))
    }
    await Promise.all(tasks)
  } catch (e) {
    error.value = (e as { data?: { message?: string } })?.data?.message ?? 'Failed to load shares'
  } finally {
    loading.value = false
  }
}

// Switching target type resets the picked id so the picker doesn't show a
// stale selection from the other list.
watch(targetType, () => { targetId.value = '' })

function inviteUrl(token: string): string {
  if (typeof window === 'undefined') return `/booth-invite/${token}`
  return `${window.location.origin}/booth-invite/${token}`
}

async function mintInvite() {
  inviteSubmitting.value = true
  error.value = ''
  try {
    const hours = Number(inviteHours.value)
    const invite = await store.createBoothInvite(
      props.booth.id,
      inviteLevel.value,
      Number.isFinite(hours) && hours > 0 ? hours : undefined,
    )
    invites.value = [invite, ...invites.value]
    inviteHours.value = ''
    await copyInviteLink(invite.token)
  } catch (e) {
    error.value = (e as { data?: { message?: string } })?.data?.message ?? 'Failed to create invite'
  } finally {
    inviteSubmitting.value = false
  }
}

async function copyInviteLink(token: string) {
  try {
    await navigator.clipboard.writeText(inviteUrl(token))
    copiedToken.value = token
    setTimeout(() => { if (copiedToken.value === token) copiedToken.value = null }, 1800)
  } catch {
    // Clipboard write blocked — leave the URL visible in the row for manual copy.
  }
}

async function revokeInvite(inviteId: string) {
  try {
    await store.revokeBoothInvite(props.booth.id, inviteId)
    invites.value = invites.value.filter(i => i.id !== inviteId)
  } catch (e) {
    error.value = (e as { data?: { message?: string } })?.data?.message ?? 'Failed to revoke invite'
  }
}

// Eligible add targets: filtered to whatever isn't already shared (and for
// users, also excluding the event owner who already has full edit).
const availableUsers = computed(() => {
  const shared = new Set(shares.value.users.map(s => s.userId))
  return allUsers.value.filter(u => !shared.has(u.id) && u.id !== props.event.ownerId)
})
const availableGroups = computed(() => {
  const shared = new Set(shares.value.groups.map(s => s.groupId))
  return allGroups.value.filter(g => !shared.has(g.id))
})
const targetOptions = computed(() => {
  if (targetType.value === 'user') {
    return [
      { value: '', label: t('boothShare.pickUser'), disabled: true },
      ...availableUsers.value.map(u => ({ value: u.id, label: u.name || u.username })),
    ]
  }
  return [
    { value: '', label: t('boothShare.pickGroup'), disabled: true },
    ...availableGroups.value.map(g => ({ value: g.id, label: g.name })),
  ]
})

async function addShare() {
  if (!targetId.value) return
  submitting.value = true
  error.value = ''
  try {
    if (targetType.value === 'user') {
      await store.shareBoothWithUser(props.booth.id, targetId.value, level.value)
    } else {
      await store.shareBoothWithGroup(props.booth.id, targetId.value, level.value)
    }
    targetId.value = ''
    await refresh()
  } catch (e) {
    error.value = (e as { data?: { message?: string } })?.data?.message ?? 'Failed to share'
  } finally {
    submitting.value = false
  }
}

async function removeShare(shareId: string, kind: 'user' | 'group') {
  try {
    await store.removeBoothShare(props.booth.id, shareId)
    if (kind === 'user') shares.value.users = shares.value.users.filter(s => s.id !== shareId)
    else shares.value.groups = shares.value.groups.filter(s => s.id !== shareId)
  } catch (e) {
    error.value = (e as { data?: { message?: string } })?.data?.message ?? 'Failed to remove share'
  }
}

const hasAnyShares = computed(() => shares.value.users.length > 0 || shares.value.groups.length > 0)

watch(() => props.modelValue, (open) => { if (open) refresh() })
</script>

<template>
  <UModal :model-value="modelValue" :ui="{ width: 'sm:max-w-md' }"
    @update:model-value="emit('update:modelValue', $event)">
    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <div>
            <h3 class="font-semibold text-white">{{ t('boothShare.title') }}</h3>
            <p class="text-xs text-gray-400 mt-0.5">{{ t('boothShare.description', { name: booth.name }) }}</p>
          </div>
          <UButton icon="i-heroicons-x-mark" variant="ghost" color="gray" size="sm"
            @click="emit('update:modelValue', false)" />
        </div>
      </template>

      <UAlert v-if="error" color="red" variant="soft" :title="error" class="mb-3" />

      <!-- Add share form (owner / admin only) — user OR group picker. -->
      <div v-if="canManage" class="space-y-2 mb-4">
        <div class="flex items-center gap-3">
          <p class="text-xs font-medium text-gray-300">{{ t('boothShare.addShare') }}</p>
          <div class="flex items-center gap-2 text-xs">
            <label class="flex items-center gap-1 cursor-pointer">
              <input type="radio" v-model="targetType" value="user" class="accent-purple-500" />
              <span class="text-gray-300">{{ t('boothShare.user') }}</span>
            </label>
            <label class="flex items-center gap-1 cursor-pointer">
              <input type="radio" v-model="targetType" value="group" class="accent-purple-500" />
              <span class="text-gray-300">{{ t('boothShare.group') }}</span>
            </label>
          </div>
        </div>
        <div class="flex gap-2">
          <USelect
            v-model="targetId"
            :options="targetOptions"
            option-attribute="label"
            value-attribute="value"
            class="flex-1"
          />
          <USelect
            v-model="level"
            :options="[
              { value: 'edit', label: t('boothShare.levelEdit') },
              { value: 'view', label: t('boothShare.levelView') },
            ]"
            option-attribute="label"
            value-attribute="value"
            class="w-24"
          />
          <UButton color="purple" :loading="submitting" :disabled="!targetId" @click="addShare">
            {{ t('common.add') }}
          </UButton>
        </div>
        <p v-if="targetType === 'user' && !availableUsers.length && !loading" class="text-xs text-gray-500">
          {{ t('boothShare.noAvailableUsers') }}
        </p>
        <p v-else-if="targetType === 'group' && !availableGroups.length && !loading" class="text-xs text-gray-500">
          {{ t('boothShare.noAvailableGroups') }}
        </p>
      </div>

      <!-- Invite links (owner / admin only) -->
      <div v-if="canManage" class="space-y-2 mb-4">
        <p class="text-xs font-medium text-gray-300">{{ t('boothShare.inviteLinks') }}</p>
        <div class="flex gap-2 items-end">
          <USelect
            v-model="inviteLevel"
            :options="[
              { value: 'edit', label: t('boothShare.levelEdit') },
              { value: 'view', label: t('boothShare.levelView') },
            ]"
            option-attribute="label"
            value-attribute="value"
            class="w-24"
          />
          <UInput
            v-model="inviteHours"
            type="number"
            min="1"
            :placeholder="t('boothShare.inviteHoursPlaceholder')"
            class="flex-1"
          />
          <UButton color="purple" icon="i-heroicons-link" :loading="inviteSubmitting" @click="mintInvite">
            {{ t('boothShare.createInvite') }}
          </UButton>
        </div>
        <div v-if="invites.length" class="space-y-1.5">
          <div v-for="inv in invites" :key="inv.id"
            class="flex items-center gap-2 px-2 py-1.5 rounded bg-gray-900 border border-gray-800 text-xs">
            <UBadge
              :label="inv.level === 'edit' ? t('boothShare.levelEdit') : t('boothShare.levelView')"
              :color="inv.level === 'edit' ? 'purple' : 'gray'"
              variant="soft"
              size="xs"
            />
            <span class="font-mono text-gray-300 truncate flex-1">{{ inviteUrl(inv.token) }}</span>
            <UButton
              :icon="copiedToken === inv.token ? 'i-heroicons-check' : 'i-heroicons-clipboard-document'"
              :color="copiedToken === inv.token ? 'green' : 'gray'"
              variant="ghost"
              size="xs"
              :title="t('boothShare.copyLink')"
              @click="copyInviteLink(inv.token)"
            />
            <UButton
              icon="i-heroicons-trash"
              variant="ghost"
              color="red"
              size="xs"
              :title="t('boothShare.revokeInvite')"
              @click="revokeInvite(inv.id)"
            />
          </div>
        </div>
        <p v-else class="text-xs text-gray-500">{{ t('boothShare.emptyInvites') }}</p>
      </div>

      <!-- Existing shares -->
      <p class="text-xs font-medium text-gray-300 mb-2">{{ t('boothShare.currentShares') }}</p>
      <div v-if="loading && !hasAnyShares" class="text-sm text-gray-500 py-3 text-center">{{ t('common.loading') }}</div>
      <div v-else-if="!hasAnyShares" class="text-sm text-gray-500 py-3 text-center">
        {{ t('boothShare.emptyShares') }}
      </div>
      <div v-else class="space-y-2">
        <!-- User shares -->
        <div v-for="s in shares.users" :key="s.id"
          class="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-900 border border-gray-800">
          <span :class="['w-2.5 h-2.5 rounded-full shrink-0', COLOR_MAP[s.color ?? ''] ?? 'bg-purple-500']" />
          <div class="flex-1 min-w-0">
            <div class="text-sm text-white truncate">{{ s.name || s.username }}</div>
            <div class="text-xs text-gray-500">@{{ s.username }}</div>
          </div>
          <UBadge
            :label="s.level === 'edit' ? t('boothShare.levelEdit') : t('boothShare.levelView')"
            :color="s.level === 'edit' ? 'purple' : 'gray'"
            variant="soft"
            size="xs"
          />
          <UButton
            v-if="canManage"
            icon="i-heroicons-trash"
            variant="ghost"
            color="red"
            size="xs"
            @click="removeShare(s.id, 'user')"
          />
        </div>
        <!-- Group shares -->
        <div v-for="s in shares.groups" :key="s.id"
          class="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-900 border border-gray-800">
          <UIcon name="i-heroicons-user-group" class="w-4 h-4 text-gray-400 shrink-0" />
          <div class="flex-1 min-w-0">
            <div class="text-sm text-white truncate">{{ s.groupName }}</div>
            <div class="text-xs text-gray-500">{{ t('boothShare.group') }}</div>
          </div>
          <UBadge
            :label="s.level === 'edit' ? t('boothShare.levelEdit') : t('boothShare.levelView')"
            :color="s.level === 'edit' ? 'purple' : 'gray'"
            variant="soft"
            size="xs"
          />
          <UButton
            v-if="canManage"
            icon="i-heroicons-trash"
            variant="ghost"
            color="red"
            size="xs"
            @click="removeShare(s.id, 'group')"
          />
        </div>
      </div>
    </UCard>
  </UModal>
</template>
