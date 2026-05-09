<script setup lang="ts">
import type { Event } from '~/stores/events'

const props = defineProps<{ event: Event }>()
const emit = defineEmits<{ delete: [id: string] }>()

const totalBooths = computed(() =>
  props.event.locations?.reduce((sum, l) => sum + (l.booths?.length ?? 0), 0) ?? 0,
)
const totalProducts = computed(() =>
  props.event.locations?.reduce((sum, l) =>
    sum + (l.booths?.reduce((s, b) => s + (b.products?.length ?? 0), 0) ?? 0), 0) ?? 0,
)
const purchasedProducts = computed(() =>
  props.event.locations?.reduce((sum, l) =>
    sum + (l.booths?.reduce((s, b) =>
      s + (b.products?.filter(p => p.isPurchased).length ?? 0), 0) ?? 0), 0) ?? 0,
)

const isConvention = computed(() => props.event.type === 'convention')
</script>

<template>
  <!-- Relative wrapper so nothing bleeds outside the card -->
  <div class="relative group">
    <NuxtLink :to="`/events/${event.id}`" class="block">
      <UCard class="hover:border-purple-500/50 transition-colors cursor-pointer">
        <div class="flex items-start justify-between">
          <div class="flex-1 min-w-0 pr-8">
            <div class="flex items-center gap-2 mb-2">
              <UIcon
                :name="isConvention ? 'i-heroicons-ticket' : 'i-heroicons-map'"
                class="w-4 h-4 flex-shrink-0"
                :class="isConvention ? 'text-purple-400' : 'text-blue-400'"
              />
              <span class="text-xs font-medium" :class="isConvention ? 'text-purple-400' : 'text-blue-400'">
                {{ isConvention ? 'Convention' : 'Travel' }}
              </span>
              <span v-if="event.date" class="text-xs text-gray-500">· {{ event.date }}</span>
            </div>
            <h3 class="font-bold text-white text-lg truncate">{{ event.name }}</h3>
            <p v-if="event.location" class="text-gray-400 text-sm">{{ event.location }}</p>
            <p v-if="event.description" class="text-gray-500 text-xs mt-1 line-clamp-2">{{ event.description }}</p>
          </div>
        </div>

        <div class="flex items-center gap-4 mt-4 pt-4 border-t border-gray-800 text-xs text-gray-400">
          <span class="flex items-center gap-1">
            <UIcon name="i-heroicons-building-office" class="w-3 h-3" />
            {{ event.locations?.length ?? 0 }} {{ isConvention ? 'halls' : 'locations' }}
          </span>
          <span class="flex items-center gap-1">
            <UIcon name="i-heroicons-shopping-bag" class="w-3 h-3" />
            {{ totalBooths }} {{ isConvention ? 'booths' : 'shops' }}
          </span>
          <span class="flex items-center gap-1 ml-auto">
            <UIcon name="i-heroicons-check-circle" class="w-3 h-3 text-green-400" />
            {{ purchasedProducts }}/{{ totalProducts }}
          </span>
        </div>
      </UCard>
    </NuxtLink>

    <!-- Dropdown overlaid at top-right, above the NuxtLink -->
    <div class="absolute top-3 right-3 z-10" @click.stop @mousedown.stop>
      <UDropdown :items="[[
        { label: 'Edit', icon: 'i-heroicons-pencil', to: `/events/${event.id}` },
        { label: 'Hall Plan', icon: 'i-heroicons-map', to: `/events/${event.id}/hallplan`, disabled: !isConvention },
        { label: 'Delete', icon: 'i-heroicons-trash', click: () => emit('delete', event.id), class: 'text-red-400' },
      ]]">
        <UButton icon="i-heroicons-ellipsis-vertical" variant="ghost" color="gray" size="xs" />
      </UDropdown>
    </div>
  </div>
</template>
