<script setup lang="ts">
import { useEventsStore } from '~/stores/events'
import { useAuthStore } from '~/stores/auth'
import { useLocale } from '~/composables/useLocale'
import type { BasicUser, Group, Event } from '~/stores/events'

definePageMeta({ layout: 'default' })

const store = useEventsStore()
const authStore = useAuthStore()
const { t } = useLocale()
const router = useRouter()

useHead({ title: 'Permissions' })

interface AdminBoothRow {
  id: string
  slug: string | null
  name: string
  hallNr: string | null
  boothNr: string | null
  iconPath: string | null
  locationName: string
  eventId: string
  eventName: string
  eventSlug: string | null
}

const allUsers = ref<BasicUser[]>([])
const allGroups = ref<Group[]>([])
const allEvents = ref<Event[]>([])
const allBooths = ref<AdminBoothRow[]>([])
const loading = ref(false)
const error = ref('')

// Section 1: user → event grants
const ueUserIds = ref<Set<string>>(new Set())
const ueEventIds = ref<Set<string>>(new Set())
const ueLevel = ref<'view' | 'edit'>('view')
const ueSubmitting = ref(false)
const ueResult = ref<{ granted: number; failed: number } | null>(null)

// Section 2: group → event grants
const geGroupIds = ref<Set<string>>(new Set())
const geEventIds = ref<Set<string>>(new Set())
const geLevel = ref<'view' | 'edit'>('view')
const geSubmitting = ref(false)
const geResult = ref<{ granted: number; failed: number } | null>(null)

// Section 3: user → booth grants
const ubUserIds = ref<Set<string>>(new Set())
const ubBoothIds = ref<Set<string>>(new Set())
const ubLevel = ref<'view' | 'edit'>('edit')
const ubSubmitting = ref(false)
const ubResult = ref<{ granted: number; failed: number } | null>(null)

// Section 4: group → booth grants
const gbGroupIds = ref<Set<string>>(new Set())
const gbBoothIds = ref<Set<string>>(new Set())
const gbLevel = ref<'view' | 'edit'>('edit')
const gbSubmitting = ref(false)
const gbResult = ref<{ granted: number; failed: number } | null>(null)

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
  error.value = ''
  try {
    const [u, g, e, b] = await Promise.all([
      store.fetchUsers(),
      store.fetchGroups(),
      $fetch<Event[]>('/api/events'),
      $fetch<AdminBoothRow[]>('/api/admin/booths'),
    ])
    allUsers.value = u
    allGroups.value = g
    allEvents.value = e
    allBooths.value = b
  } catch (e) {
    error.value = (e as { data?: { message?: string } })?.data?.message ?? 'Failed to load'
  } finally {
    loading.value = false
  }
}

function toggle(set: Ref<Set<string>>, id: string) {
  const s = new Set(set.value)
  if (s.has(id)) s.delete(id)
  else s.add(id)
  set.value = s
}

// Group booths by event for readable rendering.
const boothsByEvent = computed(() => {
  const out = new Map<string, { eventName: string; eventSlug: string | null; rows: AdminBoothRow[] }>()
  for (const b of allBooths.value) {
    if (!out.has(b.eventId)) out.set(b.eventId, { eventName: b.eventName, eventSlug: b.eventSlug, rows: [] })
    out.get(b.eventId)!.rows.push(b)
  }
  return Array.from(out.entries())
})

// Common runner: loops over (subject × target) pairs and calls the per-target
// share endpoint. Reports how many succeeded / failed (existing grants are
// upserts — the server treats a repeat as success at the new level).
async function runGrants(
  pairs: Array<() => Promise<unknown>>,
): Promise<{ granted: number; failed: number }> {
  let granted = 0
  let failed = 0
  await Promise.all(pairs.map(async (fn) => {
    try { await fn(); granted++ }
    catch { failed++ }
  }))
  return { granted, failed }
}

async function grantUsersToEvents() {
  if (!ueUserIds.value.size || !ueEventIds.value.size) return
  ueSubmitting.value = true
  ueResult.value = null
  const pairs: Array<() => Promise<unknown>> = []
  for (const eventId of ueEventIds.value) {
    for (const userId of ueUserIds.value) {
      pairs.push(() => store.shareEventWithUser(eventId, userId, ueLevel.value))
    }
  }
  ueResult.value = await runGrants(pairs)
  ueSubmitting.value = false
}

async function grantGroupsToEvents() {
  if (!geGroupIds.value.size || !geEventIds.value.size) return
  geSubmitting.value = true
  geResult.value = null
  const pairs: Array<() => Promise<unknown>> = []
  for (const eventId of geEventIds.value) {
    for (const groupId of geGroupIds.value) {
      pairs.push(() => store.shareEventWithGroup(eventId, groupId, geLevel.value))
    }
  }
  geResult.value = await runGrants(pairs)
  geSubmitting.value = false
}

async function grantUsersToBooths() {
  if (!ubUserIds.value.size || !ubBoothIds.value.size) return
  ubSubmitting.value = true
  ubResult.value = null
  const pairs: Array<() => Promise<unknown>> = []
  for (const boothId of ubBoothIds.value) {
    for (const userId of ubUserIds.value) {
      pairs.push(() => store.shareBoothWithUser(boothId, userId, ubLevel.value))
    }
  }
  ubResult.value = await runGrants(pairs)
  ubSubmitting.value = false
}

async function grantGroupsToBooths() {
  if (!gbGroupIds.value.size || !gbBoothIds.value.size) return
  gbSubmitting.value = true
  gbResult.value = null
  const pairs: Array<() => Promise<unknown>> = []
  for (const boothId of gbBoothIds.value) {
    for (const groupId of gbGroupIds.value) {
      pairs.push(() => store.shareBoothWithGroup(boothId, groupId, gbLevel.value))
    }
  }
  gbResult.value = await runGrants(pairs)
  gbSubmitting.value = false
}

function clearAll(set: Ref<Set<string>>) { set.value = new Set() }
function selectAll(set: Ref<Set<string>>, ids: string[]) { set.value = new Set(ids) }
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-bold text-white">{{ t('permissions.title') }}</h1>
      <p class="text-sm text-gray-400 mt-1">{{ t('permissions.description') }}</p>
    </div>

    <UAlert v-if="error" color="red" variant="soft" :title="error" />

    <!-- Section 1: Users → Events -->
    <UCard>
      <template #header>
        <h2 class="font-semibold text-white">{{ t('permissions.usersToEvents') }}</h2>
        <p class="text-xs text-gray-400 mt-0.5">{{ t('permissions.usersToEventsDesc') }}</p>
      </template>

      <div class="grid md:grid-cols-2 gap-4">
        <div>
          <div class="flex items-center justify-between mb-1.5">
            <span class="text-xs font-medium text-gray-300">{{ t('permissions.pickUsers') }} ({{ ueUserIds.size }})</span>
            <div class="flex gap-2 text-xs">
              <button type="button" class="text-purple-400 hover:underline" @click="selectAll(ueUserIds, allUsers.map(u => u.id))">{{ t('permissions.all') }}</button>
              <button type="button" class="text-gray-500 hover:text-gray-300" @click="clearAll(ueUserIds)">{{ t('permissions.none') }}</button>
            </div>
          </div>
          <div class="max-h-56 overflow-y-auto border border-gray-800 rounded-lg p-2 space-y-1 bg-gray-950">
            <label v-for="u in allUsers" :key="u.id"
              class="flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-800/50 cursor-pointer text-sm">
              <UCheckbox :model-value="ueUserIds.has(u.id)" @change="toggle(ueUserIds, u.id)" />
              <span class="text-white truncate">{{ u.name || u.username }}</span>
              <span class="text-xs text-gray-500 ml-auto">{{ u.role }}</span>
            </label>
            <p v-if="!allUsers.length" class="text-xs text-gray-500 text-center py-3">{{ t('permissions.emptyUsers') }}</p>
          </div>
        </div>

        <div>
          <div class="flex items-center justify-between mb-1.5">
            <span class="text-xs font-medium text-gray-300">{{ t('permissions.pickEvents') }} ({{ ueEventIds.size }})</span>
            <div class="flex gap-2 text-xs">
              <button type="button" class="text-purple-400 hover:underline" @click="selectAll(ueEventIds, allEvents.map(e => e.id))">{{ t('permissions.all') }}</button>
              <button type="button" class="text-gray-500 hover:text-gray-300" @click="clearAll(ueEventIds)">{{ t('permissions.none') }}</button>
            </div>
          </div>
          <div class="max-h-56 overflow-y-auto border border-gray-800 rounded-lg p-2 space-y-1 bg-gray-950">
            <label v-for="ev in allEvents" :key="ev.id"
              class="flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-800/50 cursor-pointer text-sm">
              <UCheckbox :model-value="ueEventIds.has(ev.id)" @change="toggle(ueEventIds, ev.id)" />
              <span class="text-white truncate">{{ ev.name }}</span>
              <span v-if="ev.date" class="text-xs text-gray-500 ml-auto shrink-0">{{ ev.date }}</span>
            </label>
            <p v-if="!allEvents.length" class="text-xs text-gray-500 text-center py-3">{{ t('permissions.emptyEvents') }}</p>
          </div>
        </div>
      </div>

      <template #footer>
        <div class="flex items-center justify-between gap-3 flex-wrap">
          <USelect
            v-model="ueLevel"
            :options="[{ value: 'view', label: t('sharing.levelView') }, { value: 'edit', label: t('sharing.levelEdit') }]"
            option-attribute="label"
            value-attribute="value"
            class="w-32"
          />
          <div class="flex items-center gap-3">
            <span v-if="ueResult" class="text-xs text-gray-400">
              {{ t('permissions.grantedN', { n: ueResult.granted }) }}
              <span v-if="ueResult.failed" class="text-red-400 ml-2">{{ t('permissions.failedN', { n: ueResult.failed }) }}</span>
            </span>
            <UButton
              color="primary"
              icon="i-heroicons-bolt"
              :disabled="!ueUserIds.size || !ueEventIds.size"
              :loading="ueSubmitting"
              @click="grantUsersToEvents"
            >{{ t('permissions.grantN', { n: ueUserIds.size * ueEventIds.size }) }}</UButton>
          </div>
        </div>
      </template>
    </UCard>

    <!-- Section 2: Groups → Events -->
    <UCard>
      <template #header>
        <h2 class="font-semibold text-white">{{ t('permissions.groupsToEvents') }}</h2>
        <p class="text-xs text-gray-400 mt-0.5">{{ t('permissions.groupsToEventsDesc') }}</p>
      </template>

      <div class="grid md:grid-cols-2 gap-4">
        <div>
          <div class="flex items-center justify-between mb-1.5">
            <span class="text-xs font-medium text-gray-300">{{ t('permissions.pickGroups') }} ({{ geGroupIds.size }})</span>
            <div class="flex gap-2 text-xs">
              <button type="button" class="text-purple-400 hover:underline" @click="selectAll(geGroupIds, allGroups.map(g => g.id))">{{ t('permissions.all') }}</button>
              <button type="button" class="text-gray-500 hover:text-gray-300" @click="clearAll(geGroupIds)">{{ t('permissions.none') }}</button>
            </div>
          </div>
          <div class="max-h-56 overflow-y-auto border border-gray-800 rounded-lg p-2 space-y-1 bg-gray-950">
            <label v-for="g in allGroups" :key="g.id"
              class="flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-800/50 cursor-pointer text-sm">
              <UCheckbox :model-value="geGroupIds.has(g.id)" @change="toggle(geGroupIds, g.id)" />
              <span class="text-white truncate">{{ g.name }}</span>
              <span class="text-xs text-gray-500 ml-auto shrink-0">{{ g.memberCount }}</span>
            </label>
            <p v-if="!allGroups.length" class="text-xs text-gray-500 text-center py-3">{{ t('permissions.emptyGroups') }}</p>
          </div>
        </div>

        <div>
          <div class="flex items-center justify-between mb-1.5">
            <span class="text-xs font-medium text-gray-300">{{ t('permissions.pickEvents') }} ({{ geEventIds.size }})</span>
            <div class="flex gap-2 text-xs">
              <button type="button" class="text-purple-400 hover:underline" @click="selectAll(geEventIds, allEvents.map(e => e.id))">{{ t('permissions.all') }}</button>
              <button type="button" class="text-gray-500 hover:text-gray-300" @click="clearAll(geEventIds)">{{ t('permissions.none') }}</button>
            </div>
          </div>
          <div class="max-h-56 overflow-y-auto border border-gray-800 rounded-lg p-2 space-y-1 bg-gray-950">
            <label v-for="ev in allEvents" :key="ev.id"
              class="flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-800/50 cursor-pointer text-sm">
              <UCheckbox :model-value="geEventIds.has(ev.id)" @change="toggle(geEventIds, ev.id)" />
              <span class="text-white truncate">{{ ev.name }}</span>
              <span v-if="ev.date" class="text-xs text-gray-500 ml-auto shrink-0">{{ ev.date }}</span>
            </label>
            <p v-if="!allEvents.length" class="text-xs text-gray-500 text-center py-3">{{ t('permissions.emptyEvents') }}</p>
          </div>
        </div>
      </div>

      <template #footer>
        <div class="flex items-center justify-between gap-3 flex-wrap">
          <USelect
            v-model="geLevel"
            :options="[{ value: 'view', label: t('sharing.levelView') }, { value: 'edit', label: t('sharing.levelEdit') }]"
            option-attribute="label"
            value-attribute="value"
            class="w-32"
          />
          <div class="flex items-center gap-3">
            <span v-if="geResult" class="text-xs text-gray-400">
              {{ t('permissions.grantedN', { n: geResult.granted }) }}
              <span v-if="geResult.failed" class="text-red-400 ml-2">{{ t('permissions.failedN', { n: geResult.failed }) }}</span>
            </span>
            <UButton
              color="primary"
              icon="i-heroicons-bolt"
              :disabled="!geGroupIds.size || !geEventIds.size"
              :loading="geSubmitting"
              @click="grantGroupsToEvents"
            >{{ t('permissions.grantN', { n: geGroupIds.size * geEventIds.size }) }}</UButton>
          </div>
        </div>
      </template>
    </UCard>

    <!-- Section 3: Users → Booths -->
    <UCard>
      <template #header>
        <h2 class="font-semibold text-white">{{ t('permissions.usersToBooths') }}</h2>
        <p class="text-xs text-gray-400 mt-0.5">{{ t('permissions.usersToBoothsDesc') }}</p>
      </template>

      <div class="grid md:grid-cols-2 gap-4">
        <div>
          <div class="flex items-center justify-between mb-1.5">
            <span class="text-xs font-medium text-gray-300">{{ t('permissions.pickUsers') }} ({{ ubUserIds.size }})</span>
            <div class="flex gap-2 text-xs">
              <button type="button" class="text-purple-400 hover:underline" @click="selectAll(ubUserIds, allUsers.map(u => u.id))">{{ t('permissions.all') }}</button>
              <button type="button" class="text-gray-500 hover:text-gray-300" @click="clearAll(ubUserIds)">{{ t('permissions.none') }}</button>
            </div>
          </div>
          <div class="max-h-72 overflow-y-auto border border-gray-800 rounded-lg p-2 space-y-1 bg-gray-950">
            <label v-for="u in allUsers" :key="u.id"
              class="flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-800/50 cursor-pointer text-sm">
              <UCheckbox :model-value="ubUserIds.has(u.id)" @change="toggle(ubUserIds, u.id)" />
              <span class="text-white truncate">{{ u.name || u.username }}</span>
              <span class="text-xs text-gray-500 ml-auto">{{ u.role }}</span>
            </label>
          </div>
        </div>

        <div>
          <div class="flex items-center justify-between mb-1.5">
            <span class="text-xs font-medium text-gray-300">{{ t('permissions.pickBooths') }} ({{ ubBoothIds.size }})</span>
            <div class="flex gap-2 text-xs">
              <button type="button" class="text-purple-400 hover:underline" @click="selectAll(ubBoothIds, allBooths.map(b => b.id))">{{ t('permissions.all') }}</button>
              <button type="button" class="text-gray-500 hover:text-gray-300" @click="clearAll(ubBoothIds)">{{ t('permissions.none') }}</button>
            </div>
          </div>
          <div class="max-h-72 overflow-y-auto border border-gray-800 rounded-lg p-2 space-y-2 bg-gray-950">
            <div v-for="[eventId, group] in boothsByEvent" :key="eventId">
              <div class="text-[10px] uppercase tracking-wide text-gray-500 px-2 py-1">{{ group.eventName }}</div>
              <label v-for="b in group.rows" :key="b.id"
                class="flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-800/50 cursor-pointer text-sm">
                <UCheckbox :model-value="ubBoothIds.has(b.id)" @change="toggle(ubBoothIds, b.id)" />
                <img v-if="b.iconPath" :src="b.iconPath" alt="" class="w-5 h-5 rounded object-cover shrink-0" />
                <UIcon v-else name="i-heroicons-shopping-bag" class="w-5 h-5 text-gray-600 shrink-0" />
                <span class="text-white truncate">{{ b.name }}</span>
                <span v-if="b.hallNr || b.boothNr" class="text-xs text-gray-500 ml-auto shrink-0">
                  {{ b.hallNr ? `H ${b.hallNr}` : '' }}{{ b.hallNr && b.boothNr ? ' · ' : '' }}{{ b.boothNr ? `S ${b.boothNr}` : '' }}
                </span>
              </label>
            </div>
            <p v-if="!allBooths.length" class="text-xs text-gray-500 text-center py-3">{{ t('permissions.emptyBooths') }}</p>
          </div>
        </div>
      </div>

      <template #footer>
        <div class="flex items-center justify-between gap-3 flex-wrap">
          <USelect
            v-model="ubLevel"
            :options="[{ value: 'view', label: t('sharing.levelView') }, { value: 'edit', label: t('sharing.levelEdit') }]"
            option-attribute="label"
            value-attribute="value"
            class="w-32"
          />
          <div class="flex items-center gap-3">
            <span v-if="ubResult" class="text-xs text-gray-400">
              {{ t('permissions.grantedN', { n: ubResult.granted }) }}
              <span v-if="ubResult.failed" class="text-red-400 ml-2">{{ t('permissions.failedN', { n: ubResult.failed }) }}</span>
            </span>
            <UButton
              color="primary"
              icon="i-heroicons-bolt"
              :disabled="!ubUserIds.size || !ubBoothIds.size"
              :loading="ubSubmitting"
              @click="grantUsersToBooths"
            >{{ t('permissions.grantN', { n: ubUserIds.size * ubBoothIds.size }) }}</UButton>
          </div>
        </div>
      </template>
    </UCard>

    <!-- Section 4: Groups → Booths -->
    <UCard>
      <template #header>
        <h2 class="font-semibold text-white">{{ t('permissions.groupsToBooths') }}</h2>
        <p class="text-xs text-gray-400 mt-0.5">{{ t('permissions.groupsToBoothsDesc') }}</p>
      </template>

      <div class="grid md:grid-cols-2 gap-4">
        <div>
          <div class="flex items-center justify-between mb-1.5">
            <span class="text-xs font-medium text-gray-300">{{ t('permissions.pickGroups') }} ({{ gbGroupIds.size }})</span>
            <div class="flex gap-2 text-xs">
              <button type="button" class="text-purple-400 hover:underline" @click="selectAll(gbGroupIds, allGroups.map(g => g.id))">{{ t('permissions.all') }}</button>
              <button type="button" class="text-gray-500 hover:text-gray-300" @click="clearAll(gbGroupIds)">{{ t('permissions.none') }}</button>
            </div>
          </div>
          <div class="max-h-72 overflow-y-auto border border-gray-800 rounded-lg p-2 space-y-1 bg-gray-950">
            <label v-for="g in allGroups" :key="g.id"
              class="flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-800/50 cursor-pointer text-sm">
              <UCheckbox :model-value="gbGroupIds.has(g.id)" @change="toggle(gbGroupIds, g.id)" />
              <span class="text-white truncate">{{ g.name }}</span>
              <span class="text-xs text-gray-500 ml-auto shrink-0">{{ g.memberCount }}</span>
            </label>
            <p v-if="!allGroups.length" class="text-xs text-gray-500 text-center py-3">{{ t('permissions.emptyGroups') }}</p>
          </div>
        </div>

        <div>
          <div class="flex items-center justify-between mb-1.5">
            <span class="text-xs font-medium text-gray-300">{{ t('permissions.pickBooths') }} ({{ gbBoothIds.size }})</span>
            <div class="flex gap-2 text-xs">
              <button type="button" class="text-purple-400 hover:underline" @click="selectAll(gbBoothIds, allBooths.map(b => b.id))">{{ t('permissions.all') }}</button>
              <button type="button" class="text-gray-500 hover:text-gray-300" @click="clearAll(gbBoothIds)">{{ t('permissions.none') }}</button>
            </div>
          </div>
          <div class="max-h-72 overflow-y-auto border border-gray-800 rounded-lg p-2 space-y-2 bg-gray-950">
            <div v-for="[eventId, group] in boothsByEvent" :key="eventId">
              <div class="text-[10px] uppercase tracking-wide text-gray-500 px-2 py-1">{{ group.eventName }}</div>
              <label v-for="b in group.rows" :key="b.id"
                class="flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-800/50 cursor-pointer text-sm">
                <UCheckbox :model-value="gbBoothIds.has(b.id)" @change="toggle(gbBoothIds, b.id)" />
                <img v-if="b.iconPath" :src="b.iconPath" alt="" class="w-5 h-5 rounded object-cover shrink-0" />
                <UIcon v-else name="i-heroicons-shopping-bag" class="w-5 h-5 text-gray-600 shrink-0" />
                <span class="text-white truncate">{{ b.name }}</span>
                <span v-if="b.hallNr || b.boothNr" class="text-xs text-gray-500 ml-auto shrink-0">
                  {{ b.hallNr ? `H ${b.hallNr}` : '' }}{{ b.hallNr && b.boothNr ? ' · ' : '' }}{{ b.boothNr ? `S ${b.boothNr}` : '' }}
                </span>
              </label>
            </div>
            <p v-if="!allBooths.length" class="text-xs text-gray-500 text-center py-3">{{ t('permissions.emptyBooths') }}</p>
          </div>
        </div>
      </div>

      <template #footer>
        <div class="flex items-center justify-between gap-3 flex-wrap">
          <USelect
            v-model="gbLevel"
            :options="[{ value: 'view', label: t('sharing.levelView') }, { value: 'edit', label: t('sharing.levelEdit') }]"
            option-attribute="label"
            value-attribute="value"
            class="w-32"
          />
          <div class="flex items-center gap-3">
            <span v-if="gbResult" class="text-xs text-gray-400">
              {{ t('permissions.grantedN', { n: gbResult.granted }) }}
              <span v-if="gbResult.failed" class="text-red-400 ml-2">{{ t('permissions.failedN', { n: gbResult.failed }) }}</span>
            </span>
            <UButton
              color="primary"
              icon="i-heroicons-bolt"
              :disabled="!gbGroupIds.size || !gbBoothIds.size"
              :loading="gbSubmitting"
              @click="grantGroupsToBooths"
            >{{ t('permissions.grantN', { n: gbGroupIds.size * gbBoothIds.size }) }}</UButton>
          </div>
        </div>
      </template>
    </UCard>
  </div>
</template>
