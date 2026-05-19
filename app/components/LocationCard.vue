<script setup lang="ts">
import draggable from 'vuedraggable'
import type { Location, Product, CatalogImage } from '~/stores/events'
import { useEventsStore } from '~/stores/events'
import { useAuthStore } from '~/stores/auth'
import { useLocale } from '~/composables/useLocale'

const props = defineProps<{
  location: Location
  eventType: 'convention' | 'travel'
  showDragHandle?: boolean
}>()

const emit = defineEmits<{
  delete: [id: string]
  // Bubbles up to the page so it can persist booth order across ALL locations
  // in one shot — needed because a drag can move a booth into a sibling card.
  boothDragEnd: []
}>()

const route = useRoute()
const store = useEventsStore()
const authStore = useAuthStore()
const { t } = useLocale()
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
  const map: Record<string, string> = {
    hall: t('event.hallType'),
    city: t('event.cityType'),
    country: t('event.countryType'),
    area: t('event.areaType'),
    district: t('event.districtType'),
  }
  return map[props.location.type] ?? props.location.type
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
  if (from) return `${t('common.from')} ${fmt(from)}`
  return `${t('common.to')} ${fmt(to!)}`
}
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between gap-2">
        <button
          v-if="showDragHandle"
          type="button"
          class="location-drag-handle shrink-0 px-1 py-1 -ml-1 text-gray-500 hover:text-gray-300 cursor-grab active:cursor-grabbing touch-none"
          :title="t('common.drag')"
          @click.stop
        >
          <UIcon name="i-heroicons-bars-3" class="w-4 h-4" />
        </button>
        <div class="flex items-center gap-3 cursor-pointer min-w-0 flex-1" @click="expanded = !expanded">
          <UIcon
            :name="expanded ? 'i-heroicons-chevron-down' : 'i-heroicons-chevron-right'"
            class="w-4 h-4 text-gray-400 shrink-0"
          />
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2 flex-wrap">
              <UBadge :label="typeLabel" variant="soft" color="gray" size="xs" />
              <span class="font-semibold text-white break-words">{{ location.name }}</span>
            </div>
            <div class="text-xs text-gray-400 mt-0.5 flex items-center gap-2 flex-wrap">
              <span>
                {{ location.booths?.length ?? 0 }} {{ eventType === 'convention' ? t('events.booths') : t('events.shops') }} ·
                {{ purchasedProducts }}/{{ totalProducts }} {{ t('event.purchased') }}
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
                  {{ t('event.addDates') }}
                </button>
              </template>
            </div>
            <!-- Inline date editor -->
            <div v-if="editingDates" class="flex items-center gap-2 mt-2 flex-wrap" @click.stop>
              <UInput v-model="dateForm.dateFrom" type="date" size="xs" class="w-32 sm:w-36" />
              <span class="text-gray-500 text-xs">–</span>
              <UInput v-model="dateForm.dateTo" type="date" size="xs" class="w-32 sm:w-36" />
              <UButton size="xs" color="purple" @click.stop="saveDates">{{ t('common.save') }}</UButton>
              <UButton size="xs" color="gray" variant="ghost" @click.stop="editingDates = false">✕</UButton>
            </div>
          </div>
        </div>

        <div class="flex items-center gap-1 shrink-0">
          <UButton
            v-if="eventType === 'convention'"
            icon="i-heroicons-map"
            variant="ghost"
            color="gray"
            size="xs"
            :to="`/events/${route.params.slug}/hallplan`"
            :title="t('booth.viewHallPlan')"
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
      <p v-if="!location.booths?.length" class="text-center py-2 text-gray-500 text-sm">
        {{ eventType === 'convention' ? t('event.noBoothsYet') : t('event.noShopsYet') }}
      </p>

      <!-- min-h ensures an empty hall still presents a drop zone wide enough
           to release onto on mobile, even before any booths exist. -->
      <draggable
        :list="location.booths ?? []"
        item-key="id"
        tag="div"
        class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 min-h-[3rem]"
        :group="{ name: 'booths', pull: authStore.isEditing, put: authStore.isEditing }"
        handle=".booth-drag-handle"
        :animation="180"
        :disabled="!authStore.isEditing"
        ghost-class="opacity-40"
        drag-class="cursor-grabbing"
        @end="emit('boothDragEnd')"
      >
        <template #item="{ element: booth }">
          <div class="relative">
            <button
              v-if="authStore.isEditing"
              type="button"
              class="booth-drag-handle absolute top-1 right-1 z-10 p-1 rounded text-gray-500 hover:text-gray-200 hover:bg-gray-800/80 cursor-grab active:cursor-grabbing touch-none"
              :title="t('common.drag')"
              @click.stop
            >
              <UIcon name="i-heroicons-bars-3" class="w-3.5 h-3.5" />
            </button>
            <BoothCard :booth="booth" :event-type="eventType" />
          </div>
        </template>
      </draggable>
    </div>

    <AddBoothModal v-model="showAddBooth" :location-id="location.id" :event-type="eventType" />
  </UCard>
</template>
