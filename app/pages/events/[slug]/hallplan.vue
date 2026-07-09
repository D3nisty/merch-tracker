<script setup lang="ts">
import { useEventsStore } from '~/stores/events'
import { useAuthStore } from '~/stores/auth'
import { useLocale } from '~/composables/useLocale'
import type { Booth, HallLayoutData } from '~/stores/events'

const route = useRoute()
const store = useEventsStore()
const authStore = useAuthStore()
const { t } = useLocale()

useHead({ title: () => store.currentEvent?.name ? `Hall plan — ${store.currentEvent.name}` : 'Hall plan' })

// ── Booth editing ──────────────────────────────────────────────────────
const editingBooth = ref(false)
const editForm = reactive({ name: '', boothNr: '', hallNr: '', website: '', notes: '' })

function startEditBooth() {
  if (!selectedBooth.value) return
  Object.assign(editForm, {
    name: selectedBooth.value.name,
    boothNr: selectedBooth.value.boothNr ?? '',
    hallNr: selectedBooth.value.hallNr ?? '',
    website: selectedBooth.value.website ?? '',
    notes: selectedBooth.value.notes ?? '',
  })
  editingBooth.value = true
}

async function saveEditBooth() {
  if (!selectedBooth.value || !editForm.name.trim()) return
  await store.updateBooth(selectedBooth.value.id, {
    name: editForm.name.trim(),
    boothNr: editForm.boothNr || null,
    hallNr: editForm.hallNr || null,
    website: editForm.website || null,
    notes: editForm.notes || null,
  })
  editingBooth.value = false
}

async function deleteBooth() {
  if (!selectedBooth.value) return
  if (!confirm(t('hallplan.deleteBooth').replace('{name}', selectedBooth.value.name))) return
  await store.deleteBooth(selectedBooth.value.id, selectedLocation.value!.id)
  selectedBoothId.value = null
}

if (!store.currentEvent) {
  await store.fetchEvent(route.params.slug as string)
}

const event = computed(() => store.currentEvent)
const selectedLocationId = ref(event.value?.locations?.[0]?.id ?? '')
const selectedLocation = computed(() => event.value?.locations?.find(l => l.id === selectedLocationId.value))
const selectedBoothId = ref<string | null>(null)

watch(selectedBoothId, () => { editingBooth.value = false })

const selectedBooth = computed<Booth | undefined>(() =>
  selectedLocation.value?.booths?.find(b => b.id === selectedBoothId.value),
)

// Modals
const showAddBooth = ref(false)
const showHallPlanSetup = ref(false)
const prefillBoothNr = ref('')

function onAddDetectedBooth(boothNr: string) {
  prefillBoothNr.value = boothNr
  showAddBooth.value = true
}

async function onCreateManualBooth(
  data: { name: string; boothNr: string; hallNr: string; website: string; notes: string },
  imageIdx: number,
  rect: { x: number; y: number; w: number; h: number },
) {
  // Create the booth
  await store.createBooth({
    locationId: selectedLocationId.value,
    name: data.name,
    boothNr: data.boothNr || null,
    hallNr: data.hallNr || null,
    website: data.website || null,
    notes: data.notes || null,
    mapX: rect.x,
    mapY: rect.y,
    mapW: rect.w,
    mapH: rect.h,
  })

  // Add position to layoutData so it shows on the map
  if (selectedLocation.value?.layoutData && data.boothNr) {
    const layout = JSON.parse(selectedLocation.value.layoutData) as HallLayoutData
    if (layout.images[imageIdx]) {
      layout.images[imageIdx].booths.push({
        boothNr: data.boothNr,
        x: rect.x,
        y: rect.y,
        w: rect.w,
        h: rect.h,
      })
      await store.updateLocation(selectedLocationId.value, { layoutData: JSON.stringify(layout) })
    }
  }
}

async function onPlaceExistingBooth(
  boothId: string,
  imageIdx: number,
  rect: { x: number; y: number; w: number; h: number },
) {
  const booth = selectedLocation.value?.booths?.find(b => b.id === boothId)
  if (!booth) return

  await store.updateBooth(boothId, { mapX: rect.x, mapY: rect.y, mapW: rect.w, mapH: rect.h })

  // Add to layoutData so it appears on the map with its boothNr
  if (selectedLocation.value?.layoutData && booth.boothNr) {
    const layout = JSON.parse(selectedLocation.value.layoutData) as HallLayoutData
    if (layout.images[imageIdx]) {
      layout.images[imageIdx].booths.push({
        boothNr: booth.boothNr,
        x: rect.x,
        y: rect.y,
        w: rect.w,
        h: rect.h,
      })
      await store.updateLocation(selectedLocationId.value, { layoutData: JSON.stringify(layout) })
    }
  }
}

// Delete an entire user-added booth (the row in `booths`, its products, and
// its images). Confirmation happened in the child component.
async function onDeleteBooth(boothId: string) {
  await store.deleteBooth(boothId)
  if (selectedBoothId.value === boothId) selectedBoothId.value = null
}

// Remove a booth from the OCR layout (e.g. false positive). Only the layout
// data is mutated — any user-added Booth row keyed by the same boothNr is
// untouched.
async function onRemoveDetectedBooth(imageIdx: number, boothNr: string) {
  if (!selectedLocation.value?.layoutData) return
  const layout = JSON.parse(selectedLocation.value.layoutData) as HallLayoutData
  const page = layout.images[imageIdx]
  if (!page) return
  page.booths = page.booths.filter(b => b.boothNr !== boothNr)
  await store.updateLocation(selectedLocationId.value, { layoutData: JSON.stringify(layout) })
}

// Stats for selected location
const locationStats = computed(() => {
  const booths = selectedLocation.value?.booths ?? []
  const products = booths.flatMap(b => b.products ?? [])
  const total = products.reduce((s, p) => s + (p.price ?? 0) * p.quantity, 0)
  const spent = products.filter(p => p.isPurchased).reduce((s, p) => s + (p.price ?? 0) * p.quantity, 0)
  return {
    booths: booths.length,
    products: products.length,
    purchased: products.filter(p => p.isPurchased).length,
    total,
    spent,
  }
})
</script>

<template>
  <div v-if="event">
    <!-- Breadcrumb -->
    <div class="flex items-center gap-1 text-sm text-gray-400 mb-6">
      <NuxtLink to="/" class="hover:text-white">{{ t('nav.events') }}</NuxtLink>
      <UIcon name="i-heroicons-chevron-right" class="w-4 h-4" />
      <NuxtLink :to="`/events/${route.params.slug}`" class="hover:text-white">{{ event.name }}</NuxtLink>
      <UIcon name="i-heroicons-chevron-right" class="w-4 h-4" />
      <span class="text-white">{{ t('hallplan.title') }}</span>
    </div>

    <div class="flex items-center justify-between mb-4 gap-3 flex-wrap">
      <h1 class="text-2xl font-bold text-white">{{ t('hallplan.title') }}</h1>
      <div class="flex gap-2">
        <UButton
          v-if="selectedLocation"
          icon="i-heroicons-map"
          color="gray"
          variant="outline"
          size="sm"
          @click="showHallPlanSetup = true"
        >
          {{ t('hallplan.setupHallPlan') }}
        </UButton>
        <UButton
          icon="i-heroicons-plus"
          color="primary"
          size="sm"
          @click="showAddBooth = true"
        >
          {{ t('hallplan.addBooth') }}
        </UButton>
      </div>
    </div>

    <!-- Location tabs -->
    <div class="flex gap-2 mb-4 flex-wrap">
      <button
        v-for="loc in event.locations"
        :key="loc.id"
        @click="selectedLocationId = loc.id; selectedBoothId = null"
        :class="[
          'px-4 py-2 rounded-field text-sm font-medium transition-all border',
          selectedLocationId === loc.id
            ? 'bg-chip-conv border-conv text-conv-soft'
            : 'bg-surface border-line text-muted hover:border-line-focus hover:text-ink',
        ]"
      >
        {{ loc.name }}
        <span class="ml-1.5 text-xs opacity-70">{{ loc.booths?.length ?? 0 }}</span>
      </button>
    </div>

    <!-- Stats bar -->
    <div v-if="selectedLocation" class="grid grid-cols-2 md:grid-cols-5 gap-2 mb-4">
      <div class="bg-surface border border-line rounded-card p-3 text-center">
        <div class="text-lg font-bold font-display text-conv">{{ locationStats.booths }}</div>
        <div class="text-xs text-muted">{{ t('hallplan.booths') }}</div>
      </div>
      <div class="bg-surface border border-line rounded-card p-3 text-center">
        <div class="text-lg font-bold font-display text-conv-soft">{{ locationStats.products }}</div>
        <div class="text-xs text-muted">{{ t('hallplan.products') }}</div>
      </div>
      <div class="bg-surface border border-line rounded-card p-3 text-center">
        <div class="text-lg font-bold font-display text-bought">{{ locationStats.purchased }}/{{ locationStats.products }}</div>
        <div class="text-xs text-muted">{{ t('event.purchased') }}</div>
      </div>
      <div class="bg-surface border border-line rounded-card p-3 text-center">
        <div class="text-lg font-bold mono text-planned">{{ locationStats.total.toFixed(0) }}€</div>
        <div class="text-xs text-muted">{{ t('hallplan.budget') }}</div>
      </div>
      <div class="bg-surface border border-line rounded-card p-3 text-center">
        <div class="text-lg font-bold mono text-bought">{{ locationStats.spent.toFixed(0) }}€</div>
        <div class="text-xs text-muted">{{ t('hallplan.spent') }}</div>
      </div>
    </div>

    <div class="grid grid-cols-1 xl:grid-cols-4 gap-6">
      <!-- Interactive hall plan (3/4 width on xl) -->
      <div class="xl:col-span-3">
        <HallPlan
          v-if="selectedLocation"
          :location="selectedLocation"
          :selected-booth-id="selectedBoothId"
          @select-booth="selectedBoothId = $event"
          @add-detected-booth="onAddDetectedBooth"
          @create-manual-booth="onCreateManualBooth"
          @place-existing-booth="onPlaceExistingBooth"
          @remove-detected-booth="onRemoveDetectedBooth"
          @delete-booth="onDeleteBooth"
        />
        <div v-else class="bg-gray-900 rounded-xl p-10 text-center text-gray-500">
          {{ t('hallplan.noHalls') }}
        </div>
      </div>

      <!-- Booth detail panel -->
      <div class="xl:col-span-1">
        <div v-if="selectedBooth" class="space-y-3 sticky top-24">
          <UCard>
            <template #header>
              <!-- Edit form header -->
              <div v-if="editingBooth" class="space-y-2">
                <div class="flex items-center justify-between mb-1">
                  <span class="text-sm font-semibold text-gray-300">{{ t('hallplan.editBooth') }}</span>
                  <div class="flex gap-1">
                    <UButton size="xs" color="red" variant="ghost" icon="i-heroicons-trash" @click="deleteBooth" />
                    <UButton size="xs" color="gray" variant="ghost" icon="i-heroicons-x-mark" @click="editingBooth = false" />
                  </div>
                </div>
                <UInput v-model="editForm.name" :placeholder="t('hallplan.boothName')" size="sm" />
                <div class="flex gap-2">
                  <UInput v-model="editForm.hallNr" :placeholder="t('hallplan.hall')" size="sm" class="w-20" />
                  <UInput v-model="editForm.boothNr" :placeholder="t('hallplan.boothNumber')" size="sm" class="flex-1" />
                </div>
                <UInput v-model="editForm.website" :placeholder="t('common.website')" size="sm" />
                <UInput v-model="editForm.notes" :placeholder="t('common.notes')" size="sm" />
                <div class="flex gap-2 pt-1">
                  <UButton size="sm" color="primary" block @click="saveEditBooth">{{ t('common.save') }}</UButton>
                  <UButton size="sm" color="gray" variant="outline" @click="editingBooth = false">{{ t('common.cancel') }}</UButton>
                </div>
              </div>

              <!-- View mode header -->
              <div v-else class="flex items-center justify-between">
                <div>
                  <h3 class="font-bold text-white text-lg">{{ selectedBooth.name }}</h3>
                  <div class="text-sm text-gray-400 flex gap-2 mt-0.5">
                    <span v-if="selectedBooth.hallNr">{{ t('hallplan.hall') }} {{ selectedBooth.hallNr }}</span>
                    <span v-if="selectedBooth.boothNr" class="font-mono bg-gray-800 px-1.5 rounded text-purple-300">
                      {{ selectedBooth.boothNr }}
                    </span>
                  </div>
                </div>
                <div class="flex gap-1">
                  <UButton
                    v-if="authStore.isEditing"
                    icon="i-heroicons-pencil-square"
                    variant="ghost"
                    size="sm"
                    color="gray"
                    @click="startEditBooth"
                  />
                  <UButton
                    :to="`/events/${route.params.slug}/booth/${selectedBooth.slug ?? selectedBooth.id}`"
                    icon="i-heroicons-arrow-top-right-on-square"
                    variant="ghost"
                    size="sm"
                    color="gray"
                  />
                </div>
              </div>
            </template>

            <div v-if="!editingBooth" class="space-y-2 max-h-80 overflow-y-auto">
              <div
                v-for="product in selectedBooth.products"
                :key="product.id"
                class="flex items-center gap-2 text-sm"
              >
                <UCheckbox
                  :model-value="product.isPurchased"
                  @change="store.togglePurchased(product)"
                />
                <span :class="['flex-1 truncate', product.isPurchased ? 'line-through text-gray-500' : 'text-white']">
                  {{ product.name }}
                </span>
                <span v-if="product.price" class="text-yellow-400 text-xs shrink-0">
                  {{ product.price }}€
                </span>
              </div>
              <p v-if="!selectedBooth.products?.length" class="text-gray-500 text-sm py-2 text-center">
                {{ t('hallplan.noProducts') }}
              </p>
            </div>

            <template v-if="!editingBooth" #footer>
              <div class="space-y-2">
                <div v-if="selectedBooth.products?.length" class="flex justify-between text-xs text-gray-400">
                  <span>Total</span>
                  <span class="text-yellow-400 font-medium">
                    {{ selectedBooth.products.reduce((s, p) => s + (p.price ?? 0) * p.quantity, 0).toFixed(2) }}€
                  </span>
                </div>
                <UButton
                  :to="`/events/${route.params.slug}/booth/${selectedBooth.slug ?? selectedBooth.id}`"
                  color="primary"
                  size="sm"
                  block
                  icon="i-heroicons-arrow-right"
                  trailing
                >
                  {{ t('hallplan.viewFullDetails') }}
                </UButton>
              </div>
            </template>
          </UCard>
        </div>

        <div v-else class="bg-gray-900 rounded-xl p-8 text-center text-gray-500 sticky top-24">
          <UIcon name="i-heroicons-cursor-arrow-rays" class="w-10 h-10 mx-auto mb-3 text-gray-600" />
          <p class="font-medium text-sm">{{ t('hallplan.selectBooth') }}</p>
          <p class="text-xs mt-1">{{ t('hallplan.selectBoothHint') }}</p>
        </div>
      </div>
    </div>

    <!-- Add booth modal -->
    <AddBoothModal
      v-model="showAddBooth"
      :location-id="selectedLocationId"
      event-type="convention"
      :prefill-booth-nr="prefillBoothNr"
      @close="prefillBoothNr = ''"
    />

    <!-- Hall plan setup modal -->
    <HallPlanSetupModal
      v-if="selectedLocation"
      v-model="showHallPlanSetup"
      :location-id="selectedLocation.id"
      :location-name="selectedLocation.name"
    />
  </div>
</template>
