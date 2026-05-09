<script setup lang="ts">
import type { Location, Product, CatalogImage } from '~/stores/events'
import { useEventsStore } from '~/stores/events'
import { useAuthStore } from '~/stores/auth'

const props = defineProps<{
  location: Location
  eventType: 'convention' | 'travel'
}>()

const emit = defineEmits<{ delete: [id: string] }>()

const route = useRoute()
const store = useEventsStore()
const authStore = useAuthStore()
const showAddBooth = ref(false)
const expanded = ref(true)

function boothItemStats(products: Product[], images: CatalogImage[]) {
  let total = 0, purchased = 0
  const articleIds = new Set(images.filter(i => i.imageType === 'article').map(i => i.id))
  total += articleIds.size
  for (const img of images) {
    if (img.imageType !== 'article') continue
    if (products.some(p => p.catalogImageId === img.id && p.isPurchased)) purchased++
  }
  for (const p of products) {
    if (articleIds.has(p.catalogImageId ?? '')) continue
    total++
    if (p.isPurchased) purchased++
  }
  return { total, purchased }
}

const totalProducts = computed(() =>
  props.location.booths?.reduce((sum, b) =>
    sum + boothItemStats(b.products ?? [], b.images ?? []).total, 0) ?? 0,
)
const purchasedProducts = computed(() =>
  props.location.booths?.reduce((sum, b) =>
    sum + boothItemStats(b.products ?? [], b.images ?? []).purchased, 0) ?? 0,
)

const typeLabel = computed(() => {
  const labels: Record<string, string> = {
    hall: 'Hall', city: 'City', country: 'Country', area: 'Area', district: 'District',
  }
  return labels[props.location.type] ?? props.location.type
})

const editingDates = ref(false)
const dateForm = reactive({ dateFrom: props.location.dateFrom ?? '', dateTo: props.location.dateTo ?? '' })

watch(() => props.location, (loc) => {
  dateForm.dateFrom = loc.dateFrom ?? ''
  dateForm.dateTo = loc.dateTo ?? ''
})

async function saveDates() {
  await store.updateLocation(props.location.id, {
    dateFrom: dateForm.dateFrom || null,
    dateTo: dateForm.dateTo || null,
  })
  editingDates.value = false
}

function formatDateRange(from: string | null, to: string | null) {
  if (!from && !to) return null
  const fmt = (d: string) => new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  if (from && to) return `${fmt(from)} – ${fmt(to)}`
  if (from) return `From ${fmt(from)}`
  return `Until ${fmt(to!)}`
}
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
            <div class="text-xs text-gray-400 mt-0.5 flex items-center gap-2 flex-wrap">
              <span>
                {{ location.booths?.length ?? 0 }} {{ eventType === 'convention' ? 'booths' : 'shops' }} ·
                {{ purchasedProducts }}/{{ totalProducts }} purchased
              </span>
              <template v-if="eventType === 'travel'">
                <span v-if="!editingDates && formatDateRange(location.dateFrom, location.dateTo)" class="text-blue-400 flex items-center gap-1">
                  <UIcon name="i-heroicons-calendar" class="w-3 h-3" />
                  {{ formatDateRange(location.dateFrom, location.dateTo) }}
                  <button v-if="authStore.isEditing" class="hover:text-white ml-0.5" @click.stop="editingDates = true">
                    <UIcon name="i-heroicons-pencil-square" class="w-3 h-3" />
                  </button>
                </span>
                <button
                  v-else-if="!editingDates && authStore.isEditing"
                  class="text-gray-600 hover:text-blue-400 flex items-center gap-1"
                  @click.stop="editingDates = true"
                >
                  <UIcon name="i-heroicons-calendar-days" class="w-3 h-3" />
                  Add dates
                </button>
              </template>
            </div>
            <!-- Inline date editor -->
            <div v-if="editingDates" class="flex items-center gap-2 mt-2" @click.stop>
              <UInput v-model="dateForm.dateFrom" type="date" size="xs" class="w-36" />
              <span class="text-gray-500 text-xs">–</span>
              <UInput v-model="dateForm.dateTo" type="date" size="xs" class="w-36" />
              <UButton size="xs" color="purple" @click.stop="saveDates">Save</UButton>
              <UButton size="xs" color="gray" variant="ghost" @click.stop="editingDates = false">✕</UButton>
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
          <template v-if="authStore.isEditing">
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
          </template>
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
