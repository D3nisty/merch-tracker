<script setup lang="ts">
import { useEventsStore } from '~/stores/events'
import { usePersonsStore } from '~/stores/persons'
import { useLocale } from '~/composables/useLocale'

const props = defineProps<{
  modelValue: boolean
  eventId: string
}>()
const emit = defineEmits<{ 'update:modelValue': [v: boolean] }>()

const store = useEventsStore()
const personsStore = usePersonsStore()
const { t } = useLocale()

const COLOR_BG: Record<string, string> = {
  purple: 'bg-purple-500', blue: 'bg-blue-500', green: 'bg-green-500',
  yellow: 'bg-yellow-500', red: 'bg-red-500', pink: 'bg-pink-500',
  orange: 'bg-orange-500', teal: 'bg-teal-500',
}
function personInitial(name: string) {
  return (name?.trim()?.[0] ?? '?').toUpperCase()
}

const participants = computed(() => store.currentEvent?.participants ?? [])
const participantIds = computed(() => new Set(participants.value.map(p => p.id)))

// Persons available to ADD: everything in the persons store that isn't already
// in this event's participant list. (`personsStore.persons` already excludes
// orphan persons with no linked user — see CLAUDE.md.)
const availableToAdd = computed(() =>
  personsStore.persons.filter(p => !participantIds.value.has(p.id)),
)

const saving = ref('')

async function add(personId: string) {
  saving.value = personId
  try {
    await store.addEventParticipant(props.eventId, personId)
  } finally {
    saving.value = ''
  }
}

async function remove(personId: string) {
  saving.value = personId
  try {
    await store.removeEventParticipant(props.eventId, personId)
  } finally {
    saving.value = ''
  }
}
</script>

<template>
  <UModal :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)" :ui="{ width: 'sm:max-w-lg' }">
    <UCard>
      <template #header>
        <div class="flex items-center gap-2 flex-wrap">
          <UIcon name="i-heroicons-user-group" class="w-5 h-5 text-purple-400" />
          <h3 class="font-semibold text-white flex-1 min-w-0">{{ t('participants.title') }}</h3>
        </div>
        <p class="text-xs text-gray-500 mt-1">{{ t('participants.hint') }}</p>
      </template>

      <div class="space-y-5">
        <div>
          <div class="text-xs uppercase tracking-wider text-gray-400 mb-2">
            {{ t('participants.assigned') }} ({{ participants.length }})
          </div>
          <div v-if="!participants.length" class="text-sm text-gray-500 py-3 text-center">
            {{ t('participants.noneAssigned') }}
          </div>
          <ul v-else class="space-y-1">
            <li
              v-for="p in participants" :key="p.id"
              class="flex items-center gap-2 p-2 rounded-lg bg-gray-900 border border-gray-800"
            >
              <span
                class="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                :class="COLOR_BG[p.color ?? 'purple'] ?? 'bg-purple-500'"
              >{{ personInitial(p.name) }}</span>
              <span class="text-sm text-white flex-1 truncate">{{ p.name }}</span>
              <UButton
                icon="i-heroicons-x-mark"
                variant="ghost" color="gray" size="xs"
                :loading="saving === p.id"
                :title="t('participants.remove')"
                @click="remove(p.id)"
              />
            </li>
          </ul>
        </div>

        <div>
          <div class="text-xs uppercase tracking-wider text-gray-400 mb-2">
            {{ t('participants.addAvailable') }} ({{ availableToAdd.length }})
          </div>
          <div v-if="!availableToAdd.length" class="text-sm text-gray-500 py-3 text-center">
            {{ t('participants.noneAvailable') }}
          </div>
          <ul v-else class="space-y-1 max-h-64 overflow-y-auto pr-1">
            <li
              v-for="p in availableToAdd" :key="p.id"
              class="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-900 transition-colors"
            >
              <span
                class="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                :class="COLOR_BG[p.color ?? 'purple'] ?? 'bg-purple-500'"
              >{{ personInitial(p.name) }}</span>
              <span class="text-sm text-gray-200 flex-1 truncate">{{ p.name }}</span>
              <UButton
                icon="i-heroicons-plus"
                color="primary" size="xs"
                :loading="saving === p.id"
                @click="add(p.id)"
              >{{ t('common.add') }}</UButton>
            </li>
          </ul>
        </div>
      </div>

      <template #footer>
        <div class="flex justify-end">
          <UButton variant="ghost" color="gray" @click="emit('update:modelValue', false)">
            {{ t('common.close') }}
          </UButton>
        </div>
      </template>
    </UCard>
  </UModal>
</template>
