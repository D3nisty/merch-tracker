<script setup lang="ts">
import type { Location } from '~/stores/events'
import { useEventsStore } from '~/stores/events'

const props = defineProps<{
  location: Location
  eventType: 'convention' | 'travel'
}>()

const emit = defineEmits<{ delete: [id: string] }>()

const route = useRoute()
const store = useEventsStore()
const showAddBooth = ref(false)
const expanded = ref(true)

const totalProducts = computed(() =>
  props.location.booths?.reduce((sum, b) => sum + (b.products?.length ?? 0), 0) ?? 0,
)
const purchasedProducts = computed(() =>
  props.location.booths?.reduce((sum, b) =>
    sum + (b.products?.filter(p => p.isPurchased).length ?? 0), 0) ?? 0,
)

const typeLabel = computed(() => {
  const labels: Record<string, string> = {
    hall: 'Hall', city: 'City', country: 'Country', area: 'Area', district: 'District',
  }
  return labels[props.location.type] ?? props.location.type
})
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3 cursor-pointer" @click="expanded = !expanded">
          <UIcon
            :name="expanded ? 'i-heroicons-chevron-down' : 'i-heroicons-chevron-right'"
            class="w-4 h-4 text-gray-400"
          />
          <div>
            <div class="flex items-center gap-2">
              <UBadge :label="typeLabel" variant="soft" color="gray" size="xs" />
              <span class="font-semibold text-white">{{ location.name }}</span>
            </div>
            <div class="text-xs text-gray-400 mt-0.5">
              {{ location.booths?.length ?? 0 }} {{ eventType === 'convention' ? 'booths' : 'shops' }} ·
              {{ purchasedProducts }}/{{ totalProducts }} purchased
            </div>
          </div>
        </div>

        <div class="flex items-center gap-1">
          <UButton
            v-if="eventType === 'convention'"
            icon="i-heroicons-map"
            variant="ghost"
            color="gray"
            size="xs"
            :to="`/events/${route.params.id}/hallplan`"
            title="View Hall Plan"
          />
          <UButton
            icon="i-heroicons-plus"
            variant="ghost"
            color="gray"
            size="xs"
            @click="showAddBooth = true"
          />
          <UButton
            icon="i-heroicons-trash"
            variant="ghost"
            color="red"
            size="xs"
            @click="emit('delete', location.id)"
          />
        </div>
      </div>
    </template>

    <div v-show="expanded">
        <div v-if="!location.booths?.length" class="text-center py-6 text-gray-500 text-sm">
          No {{ eventType === 'convention' ? 'booths' : 'shops' }} added yet.
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <BoothCard
            v-for="booth in location.booths"
            :key="booth.id"
            :booth="booth"
            :event-type="eventType"
          />
        </div>
    </div>

    <AddBoothModal v-model="showAddBooth" :location-id="location.id" :event-type="eventType" />
  </UCard>
</template>
