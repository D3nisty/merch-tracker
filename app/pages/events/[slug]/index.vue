<script setup lang="ts">
import { VueDraggable } from 'vue-draggable-plus'
import { useEventsStore } from '~/stores/events'
import { useAuthStore } from '~/stores/auth'
import { usePersonsStore } from '~/stores/persons'
import { useCurrencyStore } from '~/stores/currency'
import { useLocale } from '~/composables/useLocale'
import type { Location } from '~/stores/events'
import { formatEventDateRange } from '~/stores/events'

const route = useRoute()
const store = useEventsStore()
const authStore = useAuthStore()
const personsStore = usePersonsStore()
const currencyStore = useCurrencyStore()
const { t } = useLocale()
await store.fetchEvent(route.params.slug as string)

const event = computed(() => store.currentEvent)

if (!event.value) {
  throw createError({ statusCode: 404, message: 'Event not found' })
}

useHead({ title: () => event.value?.name ?? 'Event' })

const isConv = computed(() => event.value?.type === 'convention')

const showAddLocation = ref(false)
const showEditEvent = ref(false)
const showShareEvent = ref(false)
const showParticipants = ref(false)
const showMap = ref(false)
const showImport = ref(false)
// Travel trips default to the "Today" view (what's planned for today); the plan
// (Overview) and full Timetable are the other two tabs. Conventions only use plan.
const viewMode = ref<'today' | 'plan' | 'timetable'>(event.value?.type === 'travel' ? 'today' : 'plan')
const showDeleteLocationModal = ref(false)
const showQrScanner = ref(false)
const deleteLocationId = ref<string | null>(null)

async function onLocationDragEnd() {
  if (!event.value?.locations) return
  const ids = event.value.locations.map(l => l.id)
  try {
    await store.reorderLocations(event.value.id, ids)
  } catch (e) {
    console.error('Failed to save hall order', e)
  }
}

async function onBoothDragEnd() {
  if (!event.value?.locations) return
  const groups = event.value.locations.map(l => ({
    locationId: l.id,
    boothIds: (l.booths ?? []).map(b => b.id),
  }))
  try {
    await store.reorderBooths(event.value.id, groups)
  } catch (e) {
    console.error('Failed to save booth order', e)
  }
}

const canShare = computed(() =>
  authStore.isAdmin || event.value?.ownerId === authStore.user?.id,
)

const pid = computed(() =>
  personsStore.currentPersonId
  ?? store.currentEvent?.viewerPersonId
  ?? authStore.user?.personId
  ?? null,
)
const itemStats = computed(() => store.getItemStats(pid.value))
const plannedEntries = computed(() => Object.entries(store.getPlannedCostByCurrency(pid.value)).filter(([, v]) => Math.abs(v) > 0.005))
const paidEntries = computed(() => {
  const gross = store.getPaidCostByCurrency(pid.value)
  const savings = store.getDiscountSavingsByCurrency(pid.value)
  const net: Record<string, number> = { ...gross }
  for (const [cur, save] of Object.entries(savings)) net[cur] = (net[cur] ?? 0) - save
  return Object.entries(net).filter(([, v]) => Math.abs(v) > 0.005)
})
const savingsEntries = computed(() => Object.entries(store.getDiscountSavingsByCurrency(pid.value)).filter(([, v]) => Math.abs(v) > 0.005))

const plannedConvertedTotal = computed(() => currencyStore.convertTotals(Object.fromEntries(plannedEntries.value)))
const paidConvertedTotal = computed(() => currencyStore.convertTotals(Object.fromEntries(paidEntries.value)))

const settlements = computed(() => store.eventSettlements())

const COLOR_BG_MAP: Record<string, string> = {
  purple: 'bg-purple-500', blue: 'bg-blue-500', green: 'bg-green-500',
  yellow: 'bg-yellow-500', red: 'bg-red-500', pink: 'bg-pink-500',
  orange: 'bg-orange-500', teal: 'bg-teal-500',
}
function settlementPerson(id: string) {
  return personsStore.persons.find(p => p.id === id)
}
function settlementInitial(name: string) {
  return (name?.trim()?.[0] ?? '?').toUpperCase()
}
function settlementConverted(byCurrency: Record<string, number>) {
  return currencyStore.convertTotals(byCurrency)
}
function formatSettlementCurrencies(map: Record<string, number>): string {
  return Object.entries(map)
    .filter(([, amt]) => Math.abs(amt) >= 0.005)
    .map(([cur, amt]) => `${amt.toFixed(2)} ${cur}`)
    .join(' · ')
}

async function handleDeleteLocation() {
  if (!deleteLocationId.value) return
  await store.deleteLocation(deleteLocationId.value)
  showDeleteLocationModal.value = false
  deleteLocationId.value = null
}

function confirmDeleteLocation(id: string) {
  deleteLocationId.value = id
  showDeleteLocationModal.value = true
}

// Mobile bottom-bar FAB → add a city (travel) / hall (convention) here (editors).
const { setFab, clearFab } = useMobileFab()
onMounted(() => {
  if (authStore.isEditing) {
    setFab({
      label: isConv.value ? t('event.addHall') : t('event.addLocation'),
      icon: 'i-heroicons-plus',
      run: () => { showAddLocation.value = true },
    })
  }
})
onBeforeUnmount(clearFab)
</script>

<template>
  <div v-if="event">
    <!-- back link -->
    <NuxtLink to="/" class="text-muted hover:text-ink flex items-center gap-1.5 text-[12.5px] mb-3">
      <UIcon name="i-heroicons-chevron-left" class="w-4 h-4" /> {{ t('event.allEvents') }}
    </NuxtLink>

    <!-- header -->
    <div class="flex items-start justify-between gap-5 flex-wrap mb-4">
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2.5 mb-2 flex-wrap">
          <span
            class="text-[10.5px] font-bold uppercase tracking-[0.05em] px-2.5 py-[3px] rounded-md"
            :class="isConv ? 'text-conv-soft bg-chip-conv' : 'text-sky-soft bg-chip-sky'"
          >{{ isConv ? t('events.convention') : t('events.travelType') }}</span>
          <span v-if="event.date" class="text-[12.5px] text-muted">{{ formatEventDateRange(event.date, event.dateTo) }}</span>
          <span v-if="event.isPublic" class="text-[10px] font-bold text-bought bg-chip-bought px-2.5 py-[3px] rounded-md flex items-center gap-1">
            <UIcon name="i-heroicons-globe-alt" class="w-3 h-3" /> {{ t('sharing.public') }}
          </span>
        </div>
        <h1 class="text-[28px] font-bold text-ink-strong break-words leading-tight">{{ event.name }}</h1>
        <p v-if="event.location || event.description" class="text-[13.5px] text-muted mt-1">
          {{ event.description || event.location }}
        </p>
      </div>
      <div class="flex gap-2 items-start shrink-0 flex-wrap">
        <button
          v-if="!isConv"
          class="flex items-center gap-1.5 px-3.5 py-2 rounded-field border border-line-focus text-sky-soft hover:bg-chip-sky/50 text-[12.5px] font-semibold transition-colors"
          @click="showMap = true"
        >
          <UIcon name="i-heroicons-map" class="w-3.5 h-3.5" />
          <span class="hidden sm:inline">{{ t('map.button') }}</span>
        </button>
        <button
          v-if="!isConv && authStore.isEditing"
          class="flex items-center gap-1.5 px-3.5 py-2 rounded-field border border-line-focus text-sky-soft hover:bg-chip-sky/50 text-[12.5px] font-semibold transition-colors"
          @click="showImport = true"
        >
          <UIcon name="i-heroicons-arrow-up-tray" class="w-3.5 h-3.5" />
          <span class="hidden sm:inline">{{ t('import.addTitle') }}</span>
        </button>
        <button
          v-if="canShare"
          class="flex items-center gap-1.5 px-3.5 py-2 rounded-field border text-[12.5px] font-semibold transition-colors"
          :class="isConv ? 'border-[#3b3a6b] text-conv-soft hover:bg-chip-conv/50' : 'border-line-focus text-sky-soft hover:bg-chip-sky/50'"
          @click="showParticipants = true"
        >
          <UIcon name="i-heroicons-user-group" class="w-3.5 h-3.5" />
          <span class="hidden sm:inline">{{ t('participants.title') }}</span>
        </button>
        <button
          v-if="canShare"
          class="flex items-center gap-1.5 px-3.5 py-2 rounded-field border text-[12.5px] font-semibold transition-colors"
          :class="isConv ? 'border-[#3b3a6b] text-conv-soft hover:bg-chip-conv/50' : 'border-line-focus text-sky-soft hover:bg-chip-sky/50'"
          @click="showShareEvent = true"
        >
          <UIcon name="i-heroicons-share" class="w-3.5 h-3.5" /> {{ t('sharing.share') }}
        </button>
        <button
          v-if="authStore.isEditing"
          class="w-9 h-9 rounded-field border border-line text-muted hover:text-ink flex items-center justify-center transition-colors"
          @click="showEditEvent = true"
        >
          <UIcon name="i-heroicons-pencil" class="w-4 h-4" />
        </button>
      </div>
    </div>

    <!-- person filter notice -->
    <div v-if="personsStore.currentPerson && authStore.isEditing" class="flex items-center gap-2 mb-3.5 text-[12.5px] text-muted">
      <span class="w-2.5 h-2.5 rounded-full shrink-0" :class="COLOR_BG_MAP[personsStore.currentPerson.color] ?? 'bg-sky'" />
      {{ t('event.showingBudgetFor') }} <b class="text-ink-strong">{{ personsStore.currentPerson.name }}</b>
    </div>

    <!-- view toggle: Today ↔ Overview (shops/plan) ↔ Timetable (travel only) -->
    <div v-if="!isConv" class="flex gap-1 p-1 rounded-[11px] border border-line bg-surface-2 w-max mb-5">
      <button
        v-for="v in (['today','plan','timetable'] as const)" :key="v"
        type="button"
        class="px-4 py-1.5 rounded-[8px] text-[12.5px] flex items-center gap-1.5 transition-colors"
        :class="viewMode === v ? 'bg-sky text-on-accent font-bold' : 'text-muted hover:text-ink font-medium'"
        @click="viewMode = v"
      >
        <UIcon :name="v === 'today' ? 'i-heroicons-sun' : v === 'plan' ? 'i-heroicons-squares-2x2' : 'i-heroicons-calendar-days'" class="w-3.5 h-3.5" />
        {{ v === 'today' ? t('timetable.viewToday') : v === 'plan' ? t('timetable.viewPlan') : t('timetable.viewTimetable') }}
      </button>
    </div>

    <!-- ══ TODAY VIEW ══ -->
    <TripTimetable v-if="!isConv && viewMode === 'today'" :event="event" focus-today class="mb-8" />

    <!-- ══ TIMETABLE VIEW ══ -->
    <TripTimetable v-if="!isConv && viewMode === 'timetable'" :event="event" class="mb-8" />

    <!-- ══ OVERVIEW (plan) VIEW ══ -->
    <div v-show="isConv || viewMode === 'plan'">
    <!-- stats -->
    <div :class="['grid gap-3 mb-5', authStore.isEditing ? 'grid-cols-2 md:grid-cols-3 lg:grid-cols-5' : 'grid-cols-3']">
      <div class="rounded-card border border-line bg-surface p-3.5 text-center">
        <div class="font-display text-2xl font-bold" :class="isConv ? 'text-conv' : 'text-sky'">{{ event.locations?.length ?? 0 }}</div>
        <div class="text-[11px] text-muted mt-0.5">{{ isConv ? t('event.halls') : t('event.locations') }}</div>
      </div>
      <div class="rounded-card border border-line bg-surface p-3.5 text-center">
        <div class="font-display text-2xl font-bold" :class="isConv ? 'text-conv-soft' : 'text-conv'">
          {{ event.locations?.reduce((sum, l) => sum + (l.booths?.length ?? 0), 0) ?? 0 }}
        </div>
        <div class="text-[11px] text-muted mt-0.5">{{ isConv ? t('event.booths') : t('event.shops') }}</div>
      </div>
      <div class="rounded-card border border-line bg-surface p-3.5 text-center">
        <div class="font-display text-2xl font-bold text-bought">{{ itemStats.purchased }}/{{ itemStats.total }}</div>
        <div class="text-[11px] text-muted mt-0.5">{{ t('event.purchased') }}</div>
      </div>
      <div v-if="authStore.isEditing" class="rounded-card border border-line bg-surface p-3.5 text-center">
        <div v-if="plannedEntries.length" class="leading-snug">
          <div v-for="[cur, amt] in plannedEntries" :key="cur" class="mono text-base font-semibold text-planned">
            {{ amt.toFixed(0) }} {{ cur }}
          </div>
          <div
            v-if="plannedConvertedTotal && plannedEntries.length > 1"
            class="text-[10px] text-faint mt-0.5 mono"
            :title="plannedConvertedTotal.partial ? t('settings.convertedTotalPartial') : ''"
          >≈ {{ plannedConvertedTotal.value.toFixed(0) }} {{ plannedConvertedTotal.target }}</div>
        </div>
        <div v-else class="mono text-base font-semibold text-faint">—</div>
        <div class="text-[11px] text-muted mt-1">{{ t('event.plannedBudget') }}</div>
      </div>
      <div v-if="authStore.isEditing" class="rounded-card border border-line bg-surface p-3.5 text-center">
        <div v-if="paidEntries.length" class="leading-snug">
          <div v-for="[cur, amt] in paidEntries" :key="cur" class="mono text-base font-semibold text-bought">
            {{ amt.toFixed(0) }} {{ cur }}
          </div>
          <div
            v-if="paidConvertedTotal && paidEntries.length > 1"
            class="text-[10px] text-faint mt-0.5 mono"
            :title="paidConvertedTotal.partial ? t('settings.convertedTotalPartial') : ''"
          >≈ {{ paidConvertedTotal.value.toFixed(0) }} {{ paidConvertedTotal.target }}</div>
        </div>
        <div v-else class="mono text-base font-semibold text-faint">—</div>
        <div class="text-[11px] text-muted mt-1">
          {{ t('event.paid') }}
          <span v-if="savingsEntries.length" class="text-bought">
            · <span v-for="([cur, amt], i) in savingsEntries" :key="cur"><span v-if="i > 0"> </span>−{{ amt.toFixed(0) }} {{ cur }}</span> {{ t('discount.saved') }}
          </span>
        </div>
      </div>
    </div>

    <!-- settle up -->
    <div v-if="settlements.length" class="rounded-card border border-[#24374a] bg-surface-2 px-4 py-3.5 mb-5">
      <div class="flex items-center gap-2 mb-2.5">
        <UIcon name="i-heroicons-arrow-path-rounded-square" class="w-4 h-4" :class="isConv ? 'text-conv-soft' : 'text-sky'" />
        <span class="text-[13px] font-bold text-ink-strong">{{ t('upload.settlementForEvent') }}</span>
        <span class="text-[10px] font-bold px-1.5 py-0.5 rounded-[5px]" :class="isConv ? 'text-conv-soft bg-chip-conv' : 'text-sky-soft bg-chip-sky'">{{ settlements.length }}</span>
      </div>
      <ul class="space-y-2">
        <li
          v-for="s in settlements"
          :key="`${s.debtorPersonId}-${s.creditorPersonId}`"
          class="flex items-center gap-2 flex-wrap text-[13px]"
        >
          <span
            v-if="settlementPerson(s.debtorPersonId)"
            class="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold text-on-accent"
            :class="COLOR_BG_MAP[settlementPerson(s.debtorPersonId)!.color] ?? 'bg-sky'"
          >{{ settlementInitial(settlementPerson(s.debtorPersonId)!.name) }}</span>
          <b class="text-ink-strong">{{ settlementPerson(s.debtorPersonId)?.name }}</b>
          <span class="text-muted">{{ t('upload.owes') }}</span>
          <span
            v-if="settlementPerson(s.creditorPersonId)"
            class="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold text-on-accent"
            :class="COLOR_BG_MAP[settlementPerson(s.creditorPersonId)!.color] ?? 'bg-sky'"
          >{{ settlementInitial(settlementPerson(s.creditorPersonId)!.name) }}</span>
          <b class="text-ink-strong">{{ settlementPerson(s.creditorPersonId)?.name }}</b>
          <template v-if="s.converted != null">
            <span class="mono text-planned font-semibold ml-1">{{ s.converted.toFixed(2) }} {{ s.target }}</span>
            <span
              v-if="Object.keys(s.byCurrency).filter(c => c !== s.target).length"
              class="text-faint mono text-[11px]"
            >({{ formatSettlementCurrencies(s.byCurrency) }})</span>
            <span v-if="s.partial" class="text-planned text-[11px]">{{ t('settings.convertedTotalPartial') }}</span>
          </template>
          <span v-else class="mono text-planned font-semibold ml-1">{{ formatSettlementCurrencies(s.byCurrency) }}</span>
        </li>
      </ul>
    </div>

    <!-- cities / halls -->
    <div class="flex items-center justify-between mb-3">
      <h2 class="text-[17px] font-bold text-ink-strong">{{ isConv ? t('event.halls') : t('event.locations') }}</h2>
      <button
        v-if="authStore.isEditing"
        class="flex items-center gap-1.5 px-3.5 py-2 rounded-field border text-[12.5px] font-semibold transition-colors"
        :class="isConv ? 'border-[#3b3a6b] text-conv-soft hover:bg-chip-conv/50' : 'border-line-focus text-sky-soft hover:bg-chip-sky/50'"
        @click="showAddLocation = true"
      >
        <UIcon name="i-heroicons-plus" class="w-3.5 h-3.5" /> {{ isConv ? t('event.addHall') : t('event.addLocation') }}
      </button>
    </div>

    <div v-if="!event.locations?.length" class="text-center py-10 text-faint">
      {{ isConv ? t('event.noHalls') : t('event.noLocations') }}
    </div>

    <VueDraggable
      v-if="event.locations?.length"
      v-model="event.locations"
      tag="div"
      class="space-y-3"
      handle=".location-drag-handle"
      :animation="180"
      :disabled="!authStore.isEditing"
      ghost-class="opacity-40"
      drag-class="cursor-grabbing"
      @end="onLocationDragEnd"
    >
      <LocationCard
        v-for="loc in event.locations"
        :key="loc.id"
        :location="loc"
        :event-type="event.type"
        :show-drag-handle="authStore.isEditing"
        @delete="confirmDeleteLocation(loc.id)"
        @booth-drag-end="onBoothDragEnd"
      />
    </VueDraggable>
    </div><!-- /overview view -->

    <!-- modals -->
    <AddLocationModal v-model="showAddLocation" :event-id="event.id" :event-type="event.type" />
    <EditEventModal v-model="showEditEvent" :event="event" />
    <ShareEventModal v-model="showShareEvent" :event="event" />
    <EventParticipantsModal v-model="showParticipants" :event-id="event.id" />
    <TripMapModal v-if="event.type === 'travel'" v-model="showMap" :event="event" :can-edit="authStore.isEditing" />
    <ImportTravelModal v-if="event.type === 'travel'" v-model="showImport" :target-event="event" />

    <QrScannerModal
      v-if="event.type === 'convention'"
      v-model="showQrScanner"
      :event-slug="event.slug ?? (route.params.slug as string)"
      :locations="event.locations ?? []"
    />

    <!-- floating scan QR (convention only) -->
    <ClientOnly>
      <button
        v-if="event.type === 'convention'"
        type="button"
        class="fixed bottom-24 lg:bottom-6 left-4 lg:left-[238px] z-40 flex items-center gap-2 px-4 py-3 rounded-full grad-conv text-[13px] font-bold shadow-lg"
        style="box-shadow: 0 12px 30px -8px rgba(129,140,248,0.5);"
        :title="t('qrscan.title')"
        @click="showQrScanner = true"
      >
        <UIcon name="i-heroicons-qr-code" class="w-4 h-4" />
        <span class="hidden sm:inline">{{ t('qrscan.scan') }}</span>
      </button>
    </ClientOnly>

    <!-- delete location confirm -->
    <UModal v-model="showDeleteLocationModal" :ui="{ width: 'sm:max-w-sm', background: '', ring: '', rounded: 'rounded-window', shadow: '' }">
      <div class="bg-surface border border-line rounded-window p-6 text-center">
        <div class="w-12 h-12 mx-auto mb-3.5 rounded-card bg-chip-must flex items-center justify-center">
          <UIcon name="i-heroicons-trash" class="w-6 h-6 text-must" />
        </div>
        <h3 class="text-[17px] font-bold text-ink-strong mb-1.5">{{ t('event.deleteLocation') }}</h3>
        <p class="text-[13px] text-muted mb-5 leading-relaxed">{{ t('event.deleteLocationDesc') }}</p>
        <div class="flex gap-2.5">
          <button class="flex-1 py-2.5 rounded-field border border-line text-ink text-[13px] font-semibold" @click="showDeleteLocationModal = false">{{ t('common.cancel') }}</button>
          <button class="flex-1 py-2.5 rounded-field bg-must text-chip-must text-[13px] font-bold" @click="handleDeleteLocation">{{ t('common.delete') }}</button>
        </div>
      </div>
    </UModal>
  </div>
</template>
