<script setup lang="ts">
import { VueDraggable } from 'vue-draggable-plus'
import type { Location, Product, CatalogImage, Booth, LocationReceipt } from '~/stores/events'
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
const showAddReceipt = ref(false)
const viewingReceipt = ref<LocationReceipt | null>(null)
const expanded = ref(true)

// City receipts are only meaningful for travel events with at least one shop.
const canHaveReceipts = computed(() => props.eventType === 'travel')
const hasShops = computed(() => (props.location.booths?.length ?? 0) > 0)
const receipts = computed(() => props.location.receipts ?? [])

function openReceipt(r: LocationReceipt) {
  viewingReceipt.value = r
}

// vue-draggable-plus mutates the array via splice and re-emits the whole list
// on update:modelValue. Routing both through `location.booths` lets the parent
// see cross-list moves naturally — and the setter handles the case where the
// API returned the location without a `booths` field at all (empty location).
const boothsList = computed({
  get: () => props.location.booths ?? [],
  set: (val: Booth[]) => { (props.location as Location & { booths?: Booth[] }).booths = val },
})

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
              v-if="canHaveReceipts"
              icon="i-heroicons-receipt-percent"
              variant="ghost"
              color="green"
              size="xs"
              :disabled="!hasShops"
              :title="hasShops ? t('upload.addLocationReceipt') : t('upload.noShopsYet')"
              @click="hasShops && (showAddReceipt = true)"
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
          </template>
        </div>
      </div>
    </template>

    <div v-show="expanded">
      <!-- City receipts (travel mode only) -->
      <div v-if="canHaveReceipts && receipts.length" class="mb-3">
        <div class="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <UIcon name="i-heroicons-receipt-percent" class="w-3.5 h-3.5 text-green-400" />
          {{ t('upload.cityReceipts') }}
        </div>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="r in receipts"
            :key="r.id"
            type="button"
            class="group relative w-24 h-24 rounded-lg overflow-hidden border border-gray-800 hover:border-green-500/60 transition-colors bg-black"
            :title="r.customName || r.originalName"
            @click="openReceipt(r)"
          >
            <img :src="r.path" :alt="r.customName || r.originalName" class="w-full h-full object-cover" />
            <div class="absolute inset-x-0 bottom-0 px-1 py-0.5 bg-black/70 text-xs text-white truncate">
              {{ r.customName || t('catalog.receipt') }}
            </div>
          </button>
        </div>
      </div>

      <p v-if="!location.booths?.length" class="text-center py-2 text-gray-500 text-sm">
        {{ eventType === 'convention' ? t('event.noBoothsYet') : t('event.noShopsYet') }}
      </p>

      <!-- min-h ensures an empty hall still presents a drop zone wide enough
           to release onto on mobile, even before any booths exist. -->
      <VueDraggable
        v-model="boothsList"
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
        <div v-for="booth in boothsList" :key="booth.id" class="relative">
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
      </VueDraggable>
    </div>

    <AddBoothModal v-model="showAddBooth" :location-id="location.id" :event-type="eventType" />
    <UploadLocationReceiptModal
      v-if="canHaveReceipts"
      v-model="showAddReceipt"
      :location-id="location.id"
      :location-name="location.name"
    />
    <LocationReceiptModal
      v-if="viewingReceipt"
      :model-value="!!viewingReceipt"
      :receipt="viewingReceipt"
      :location-id="location.id"
      :can-edit="authStore.isEditing"
      @update:model-value="(v: boolean) => { if (!v) viewingReceipt = null }"
    />
  </UCard>
</template>
