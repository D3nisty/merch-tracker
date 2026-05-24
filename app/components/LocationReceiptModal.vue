<script setup lang="ts">
import { useEventsStore, type LocationReceipt, type Product } from '~/stores/events'
import { useAuthStore } from '~/stores/auth'
import { useLocale } from '~/composables/useLocale'

const props = defineProps<{
  modelValue: boolean
  receipt: LocationReceipt
  locationId: string
  /**
   * Whether the viewer can edit the parent event (drives the delete-receipt
   * affordance). Marking products as purchased works for ANY logged-in viewer
   * with a Person id — same rule as ProductItem.
   */
  canEdit: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [v: boolean] }>()

const store = useEventsStore()
const authStore = useAuthStore()
const { t } = useLocale()

const canMark = computed(() => authStore.isLoggedIn && !!store.currentEvent?.viewerPersonId)
const fullscreen = ref(false)
const confirmingDelete = ref(false)

// Flatten every product across every booth under this location. Each entry
// carries its parent booth name so the checklist can label the source shop.
type ReceiptRow = { product: Product; boothName: string; boothId: string }
const rows = computed<ReceiptRow[]>(() => {
  const loc = store.currentEvent?.locations?.find(l => l.id === props.locationId)
  if (!loc) return []
  const list: ReceiptRow[] = []
  for (const booth of loc.booths ?? []) {
    for (const product of booth.products ?? []) {
      list.push({ product, boothName: booth.name, boothId: booth.id })
    }
  }
  // Stable order: shop name → product name.
  return list.sort((a, b) => {
    const byShop = a.boothName.localeCompare(b.boothName)
    return byShop !== 0 ? byShop : a.product.name.localeCompare(b.product.name)
  })
})

const totalPurchased = computed(() => rows.value.filter(r => r.product.isPurchased).length)

const displayName = computed(() => props.receipt.customName || props.receipt.originalName || t('catalog.receipt'))

async function togglePurchased(product: Product) {
  if (!canMark.value) return
  await store.togglePurchased(product)
}

async function handleDelete() {
  if (!confirmingDelete.value) {
    confirmingDelete.value = true
    return
  }
  await store.deleteLocationReceipt(props.receipt.id, props.locationId)
  emit('update:modelValue', false)
}

function formatPrice(p: Product): string {
  if (p.price == null) return ''
  return `${p.price.toFixed(2)} ${p.currency}`
}

function openInMaps() {
  if (typeof window === 'undefined') return
  if (props.receipt.latitude == null || props.receipt.longitude == null) return
  window.open(`https://www.google.com/maps?q=${props.receipt.latitude},${props.receipt.longitude}`, '_blank', 'noopener,noreferrer')
}

// Reset transient state when the modal closes.
watch(() => props.modelValue, (open) => {
  if (!open) {
    confirmingDelete.value = false
    fullscreen.value = false
  }
})
</script>

<template>
  <UModal
    :model-value="modelValue"
    @update:model-value="emit('update:modelValue', $event)"
    :ui="{ width: 'sm:max-w-5xl' }"
  >
    <UCard :ui="{ body: { padding: 'p-0' } }">
      <template #header>
        <div class="flex items-center gap-2 flex-wrap">
          <UIcon name="i-heroicons-receipt-percent" class="w-5 h-5 text-green-400 shrink-0" />
          <h3 class="font-semibold text-white truncate min-w-0 flex-1">{{ displayName }}</h3>
          <UBadge :label="`${totalPurchased}/${rows.length}`" variant="soft" color="green" size="xs" class="shrink-0" />
          <UButton
            v-if="receipt.latitude != null && receipt.longitude != null"
            icon="i-heroicons-map-pin"
            variant="ghost" color="purple" size="xs"
            :title="t('upload.openInMaps')"
            @click="openInMaps"
          />
          <UButton
            v-if="canEdit"
            :icon="confirmingDelete ? 'i-heroicons-check' : 'i-heroicons-trash'"
            variant="ghost" :color="confirmingDelete ? 'red' : 'gray'"
            size="xs"
            :title="confirmingDelete ? t('upload.deleteReceiptConfirm') : t('common.delete')"
            @click="handleDelete"
          />
        </div>
        <p class="text-xs text-gray-500 mt-1">{{ t('upload.receiptsCheckAcrossShops') }}</p>
      </template>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-0">
        <!-- Image panel -->
        <div class="relative bg-black flex items-center justify-center min-h-[240px]">
          <img
            :src="receipt.path"
            :alt="displayName"
            class="w-full max-h-[70vh] object-contain cursor-zoom-in"
            @click="fullscreen = true"
          />
          <UButton
            icon="i-heroicons-arrows-pointing-out"
            variant="solid" color="gray" size="xs"
            class="absolute top-2 right-2 opacity-70 hover:opacity-100"
            @click="fullscreen = true"
          />
        </div>

        <!-- Checklist panel -->
        <div class="p-4 bg-gray-950 max-h-[70vh] overflow-y-auto">
          <div v-if="!rows.length" class="text-sm text-gray-500 text-center py-8">
            {{ t('upload.noShopsYet') }}
          </div>
          <div v-else class="space-y-1">
            <template v-for="(row, i) in rows" :key="row.product.id">
              <div
                v-if="i === 0 || rows[i - 1]!.boothName !== row.boothName"
                class="text-xs font-medium text-purple-300 uppercase tracking-wider px-2 pt-3 first:pt-0 pb-1"
              >
                {{ row.boothName }}
              </div>
              <label
                class="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-900 cursor-pointer transition-colors"
                :class="{ 'opacity-60 cursor-not-allowed': !canMark }"
              >
                <UCheckbox
                  :model-value="row.product.isPurchased"
                  :disabled="!canMark"
                  @change="togglePurchased(row.product)"
                />
                <div class="flex-1 min-w-0">
                  <div :class="['text-sm', row.product.isPurchased ? 'line-through text-gray-500' : 'text-white']">
                    {{ row.product.name }}
                  </div>
                  <div v-if="row.product.size || row.product.category" class="text-xs text-gray-500 mt-0.5">
                    <span v-if="row.product.size">{{ row.product.size }}</span>
                    <span v-if="row.product.size && row.product.category"> · </span>
                    <span v-if="row.product.category">{{ row.product.category }}</span>
                  </div>
                </div>
                <span v-if="row.product.price != null" class="text-xs text-gray-400 shrink-0 font-mono">
                  {{ formatPrice(row.product) }}
                </span>
              </label>
            </template>
          </div>
        </div>
      </div>
    </UCard>

    <!-- Fullscreen image overlay -->
    <Teleport to="body">
      <div
        v-if="fullscreen"
        class="fixed inset-0 z-[9999] bg-gray-950 flex flex-col"
        style="overscroll-behavior: none"
        @click="fullscreen = false"
      >
        <div class="flex items-center gap-2 px-3 py-3 bg-gray-900 border-b border-gray-800 shrink-0">
          <UButton icon="i-heroicons-x-mark" variant="ghost" color="gray" size="sm" @click="fullscreen = false">
            <span class="hidden sm:inline">{{ t('common.close') }}</span>
          </UButton>
          <span class="text-white font-medium text-sm truncate flex-1 min-w-0">{{ displayName }}</span>
        </div>
        <div class="flex-1 overflow-auto bg-black flex items-center justify-center" @click.stop>
          <img :src="receipt.path" :alt="displayName" class="max-w-full max-h-full object-contain" />
        </div>
      </div>
    </Teleport>
  </UModal>
</template>
