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
const showPlanner = ref(false)
const viewingReceipt = ref<LocationReceipt | null>(null)
const expanded = ref(true)

const itineraryCount = computed(() => props.location.itinerary?.length ?? 0)

const isConv = computed(() => props.eventType === 'convention')

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
  <div :id="`loc-${location.id}`" class="rounded-window bg-surface border border-line overflow-hidden scroll-mt-24">
    <!-- header -->
    <div class="flex items-center gap-3 px-[18px] py-[15px]" :class="expanded ? 'border-b border-line-soft' : ''">
      <button
        v-if="showDragHandle"
        type="button"
        class="location-drag-handle shrink-0 text-faint hover:text-muted cursor-grab active:cursor-grabbing touch-none"
        :title="t('common.drag')"
        @click.stop
      >
        <UIcon name="i-heroicons-bars-3" class="w-4 h-4" />
      </button>
      <button type="button" class="shrink-0 text-muted" @click="expanded = !expanded">
        <UIcon :name="expanded ? 'i-heroicons-chevron-down' : 'i-heroicons-chevron-right'" class="w-4 h-4" />
      </button>
      <div class="flex items-center gap-2.5 flex-wrap min-w-0 flex-1 cursor-pointer" @click="expanded = !expanded">
        <span class="text-[10px] font-bold uppercase tracking-[0.05em] text-muted bg-line-soft px-2 py-[3px] rounded-[5px]">{{ typeLabel }}</span>
        <span class="text-[15px] font-bold text-ink-strong">{{ location.name }}</span>
        <span class="text-xs text-muted">{{ location.booths?.length ?? 0 }} {{ isConv ? t('events.booths') : t('events.shops') }} · {{ purchasedProducts }}/{{ totalProducts }} {{ t('event.purchased') }}</span>
        <!-- date chip (travel) -->
        <template v-if="eventType === 'travel'">
          <span
            v-if="!editingDates && formatDateRange(location.dateFrom, location.dateTo)"
            class="text-xs text-sky-soft flex items-center gap-1"
            @click.stop
          >
            <UIcon name="i-heroicons-calendar" class="w-3 h-3" />
            {{ formatDateRange(location.dateFrom, location.dateTo) }}
            <button v-if="authStore.isEditing" class="hover:text-ink ml-0.5" @click.stop="editingDates = true">
              <UIcon name="i-heroicons-pencil-square" class="w-3 h-3" />
            </button>
          </span>
          <button
            v-else-if="!editingDates && authStore.isEditing"
            class="text-faint hover:text-sky-soft flex items-center gap-1 text-xs"
            @click.stop="editingDates = true"
          >
            <UIcon name="i-heroicons-calendar-days" class="w-3 h-3" /> {{ t('event.addDates') }}
          </button>
        </template>
      </div>

      <!-- actions -->
      <div class="flex items-center gap-1 shrink-0">
        <button
          v-if="!isConv"
          class="relative w-7 h-7 rounded-md flex items-center justify-center text-sky-soft hover:bg-chip-sky/50 transition-colors"
          :title="t('planner.title')"
          @click.stop="showPlanner = true"
        >
          <UIcon name="i-heroicons-calendar-days" class="w-4 h-4" />
          <span v-if="itineraryCount" class="absolute -top-1 -right-1 min-w-[15px] h-[15px] px-1 rounded-full bg-sky text-on-accent text-[9px] font-bold flex items-center justify-center">{{ itineraryCount }}</span>
        </button>
        <NuxtLink
          v-if="isConv"
          :to="`/events/${route.params.slug}/hallplan`"
          class="w-7 h-7 rounded-md flex items-center justify-center text-muted hover:text-ink hover:bg-surface-2 transition-colors"
          :title="t('booth.viewHallPlan')"
          @click.stop
        >
          <UIcon name="i-heroicons-map" class="w-4 h-4" />
        </NuxtLink>
        <template v-if="authStore.isEditing">
          <button
            v-if="canHaveReceipts"
            class="w-7 h-7 rounded-md flex items-center justify-center text-bought hover:bg-surface-2 disabled:opacity-40 transition-colors"
            :disabled="!hasShops"
            :title="hasShops ? t('upload.addLocationReceipt') : t('upload.noShopsYet')"
            @click.stop="hasShops && (showAddReceipt = true)"
          >
            <UIcon name="i-heroicons-receipt-percent" class="w-4 h-4" />
          </button>
          <button class="w-7 h-7 rounded-md flex items-center justify-center text-muted hover:text-ink hover:bg-surface-2 transition-colors" @click.stop="showAddBooth = true">
            <UIcon name="i-heroicons-plus" class="w-4 h-4" />
          </button>
          <button class="w-7 h-7 rounded-md flex items-center justify-center text-must hover:bg-chip-must/50 transition-colors" @click.stop="emit('delete', location.id)">
            <UIcon name="i-heroicons-trash" class="w-4 h-4" />
          </button>
        </template>
      </div>
    </div>

    <!-- inline date editor -->
    <div v-if="editingDates" class="flex items-center gap-2 flex-wrap px-[18px] py-2.5 border-b border-line-soft" @click.stop>
      <input v-model="dateForm.dateFrom" type="date" class="px-2 py-1 rounded-field border border-line bg-surface-2 text-xs text-ink w-36" />
      <span class="text-faint text-xs">–</span>
      <input v-model="dateForm.dateTo" type="date" class="px-2 py-1 rounded-field border border-line bg-surface-2 text-xs text-ink w-36" />
      <button class="px-2.5 py-1 rounded-field grad-primary text-xs font-bold" @click.stop="saveDates">{{ t('common.save') }}</button>
      <button class="px-2 py-1 rounded-field text-muted text-xs" @click.stop="editingDates = false">✕</button>
    </div>

    <div v-show="expanded" class="p-[18px]">
      <!-- city receipts (travel) -->
      <div v-if="canHaveReceipts && receipts.length" class="mb-4">
        <div class="text-[10.5px] font-bold uppercase tracking-[0.08em] text-faint mb-2 flex items-center gap-1.5">
          <UIcon name="i-heroicons-receipt-percent" class="w-3.5 h-3.5 text-bought" /> {{ t('upload.cityReceipts') }}
        </div>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="r in receipts"
            :key="r.id"
            type="button"
            class="group relative w-[70px] h-[70px] rounded-[10px] overflow-hidden border border-line hover:border-bought/60 transition-colors bg-surface-2"
            :title="r.customName || r.originalName"
            @click="openReceipt(r)"
          >
            <img :src="r.path" :alt="r.customName || r.originalName" class="w-full h-full object-cover" />
            <div class="absolute inset-x-0 bottom-0 px-1 py-0.5 bg-app/70 text-[9px] text-ink truncate">{{ r.customName || t('catalog.receipt') }}</div>
          </button>
          <button
            v-if="authStore.isEditing"
            type="button"
            class="w-[70px] h-[70px] rounded-[10px] border-[1.5px] border-dashed border-line-focus flex items-center justify-center text-faint hover:text-bought transition-colors"
            @click="showAddReceipt = true"
          >
            <UIcon name="i-heroicons-plus" class="w-4.5 h-4.5" />
          </button>
        </div>
      </div>

      <p v-if="!location.booths?.length" class="text-center py-2 text-faint text-sm">
        {{ isConv ? t('event.noBoothsYet') : t('event.noShopsYet') }}
      </p>

      <VueDraggable
        v-model="boothsList"
        tag="div"
        class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 min-h-[3rem]"
        :class="isConv ? 'xl:grid-cols-4' : ''"
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
            class="booth-drag-handle absolute top-1.5 right-1.5 z-10 p-1 rounded text-faint hover:text-ink hover:bg-app/60 cursor-grab active:cursor-grabbing touch-none"
            :title="t('common.drag')"
            @click.stop
          >
            <UIcon name="i-heroicons-bars-3" class="w-3.5 h-3.5" />
          </button>
          <BoothCard :booth="booth" :event-type="eventType" />
        </div>
      </VueDraggable>
    </div>

    <CityPlannerModal v-if="!isConv" v-model="showPlanner" :location="location" :can-edit="authStore.isEditing" />
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
  </div>
</template>
