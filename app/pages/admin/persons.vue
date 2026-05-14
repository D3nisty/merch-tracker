<script setup lang="ts">
import { useAuthStore } from '~/stores/auth'
import { useLocale } from '~/composables/useLocale'

definePageMeta({ layout: 'default' })

const authStore = useAuthStore()
const { t } = useLocale()
const router = useRouter()

useHead({ title: 'Persons' })

interface AdminPerson {
  id: string
  name: string
  color: string
  createdAt: string
  linkedUser: { userId: string; username: string } | null
  markCount: number
  productCount: number
}

const persons = ref<AdminPerson[]>([])
const loading = ref(false)
const error = ref('')
const confirmOrphanDelete = ref(false)
const deleteTarget = ref<AdminPerson | null>(null)
// UModal needs a boolean v-model (project quirk). Keep the target object as
// state and use a writable boolean alias for the modal.
const showDeleteTarget = computed({
  get: () => deleteTarget.value !== null,
  set: (v: boolean) => { if (!v) deleteTarget.value = null },
})

const COLOR_BG: Record<string, string> = {
  purple: 'bg-purple-500',
  blue: 'bg-blue-500',
  green: 'bg-green-500',
  yellow: 'bg-yellow-500',
  red: 'bg-red-500',
  pink: 'bg-pink-500',
  orange: 'bg-orange-500',
  teal: 'bg-teal-500',
}

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
    persons.value = await $fetch<AdminPerson[]>('/api/admin/persons')
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load'
  } finally {
    loading.value = false
  }
}

async function deletePerson(p: AdminPerson) {
  try {
    await $fetch(`/api/admin/persons/${p.id}`, { method: 'DELETE' })
    deleteTarget.value = null
    await refresh()
  } catch (e: unknown) {
    const msg = (e as { data?: { message?: string }; message?: string }).data?.message
      ?? (e as { message?: string }).message
      ?? 'Failed to delete'
    error.value = msg
    deleteTarget.value = null
  }
}

async function deleteAllOrphans() {
  confirmOrphanDelete.value = false
  try {
    await $fetch('/api/admin/persons/orphans', { method: 'DELETE' })
    await refresh()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to delete orphans'
  }
}

const orphans = computed(() => persons.value.filter(p => !p.linkedUser))
</script>

<template>
  <div>
    <div class="mb-6 flex items-start justify-between gap-3 flex-wrap">
      <div>
        <h1 class="text-2xl font-bold text-white">{{ t('admin.personsTitle') }}</h1>
        <p class="text-sm text-gray-400 mt-1">{{ t('admin.personsDescription') }}</p>
      </div>
      <div class="flex gap-2">
        <UButton variant="outline" color="gray" icon="i-heroicons-arrow-path" :loading="loading" @click="refresh">
          {{ t('common.refresh') }}
        </UButton>
        <UButton
          v-if="orphans.length > 0"
          color="red"
          icon="i-heroicons-trash"
          @click="confirmOrphanDelete = true"
        >
          {{ t('admin.deleteAllOrphans', { n: orphans.length }) }}
        </UButton>
      </div>
    </div>

    <UAlert v-if="error" color="red" variant="soft" :title="error" class="mb-4" />

    <div class="rounded-xl bg-gray-900 border border-gray-800 overflow-hidden">
      <table class="w-full text-sm">
        <thead class="bg-gray-950 text-gray-400 text-xs uppercase">
          <tr>
            <th class="text-left px-4 py-2 font-medium">{{ t('admin.personName') }}</th>
            <th class="text-left px-4 py-2 font-medium">{{ t('admin.linkedUser') }}</th>
            <th class="text-right px-4 py-2 font-medium">{{ t('admin.markCount') }}</th>
            <th class="text-right px-4 py-2 font-medium">{{ t('admin.productCount') }}</th>
            <th class="px-4 py-2"></th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-800">
          <tr v-for="p in persons" :key="p.id" class="hover:bg-gray-800/50">
            <td class="px-4 py-2 text-white">
              <div class="flex items-center gap-2">
                <span :class="['w-3 h-3 rounded-full shrink-0', COLOR_BG[p.color] ?? 'bg-purple-500']" />
                {{ p.name }}
              </div>
            </td>
            <td class="px-4 py-2">
              <span v-if="p.linkedUser" class="text-gray-300">
                @{{ p.linkedUser.username }}
              </span>
              <span v-else class="text-xs text-gray-500 italic">{{ t('admin.unlinked') }}</span>
            </td>
            <td class="px-4 py-2 text-right text-gray-400 tabular-nums">{{ p.markCount }}</td>
            <td class="px-4 py-2 text-right text-gray-400 tabular-nums">{{ p.productCount }}</td>
            <td class="px-4 py-2 text-right">
              <UButton
                v-if="!p.linkedUser"
                icon="i-heroicons-trash"
                variant="ghost"
                color="red"
                size="xs"
                @click="deleteTarget = p"
              />
              <span v-else class="text-xs text-gray-600">—</span>
            </td>
          </tr>
          <tr v-if="!loading && !persons.length">
            <td colspan="5" class="text-center py-6 text-gray-500">{{ t('admin.noPersons') }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <UModal v-model="showDeleteTarget" :ui="{ width: 'sm:max-w-sm' }">
      <UCard v-if="deleteTarget">
        <template #header>
          <h3 class="font-semibold text-white">{{ t('admin.deletePerson') }}</h3>
        </template>
        <p class="text-sm text-gray-400">
          {{ t('admin.deletePersonDesc', { name: deleteTarget.name, marks: deleteTarget.markCount }) }}
        </p>
        <template #footer>
          <div class="flex gap-2 justify-end">
            <UButton variant="ghost" color="gray" @click="deleteTarget = null">{{ t('common.cancel') }}</UButton>
            <UButton color="red" @click="deletePerson(deleteTarget!)">{{ t('common.delete') }}</UButton>
          </div>
        </template>
      </UCard>
    </UModal>

    <UModal v-model="confirmOrphanDelete" :ui="{ width: 'sm:max-w-sm' }">
      <UCard>
        <template #header>
          <h3 class="font-semibold text-white">{{ t('admin.deleteAllOrphansConfirm') }}</h3>
        </template>
        <p class="text-sm text-gray-400">
          {{ t('admin.deleteAllOrphansDesc', { n: orphans.length }) }}
        </p>
        <template #footer>
          <div class="flex gap-2 justify-end">
            <UButton variant="ghost" color="gray" @click="confirmOrphanDelete = false">{{ t('common.cancel') }}</UButton>
            <UButton color="red" @click="deleteAllOrphans">{{ t('common.delete') }}</UButton>
          </div>
        </template>
      </UCard>
    </UModal>
  </div>
</template>
