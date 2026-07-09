<script setup lang="ts">
import type { Product } from '~/stores/events'
import { useEventsStore } from '~/stores/events'
import { useAuthStore } from '~/stores/auth'
import { usePersonsStore } from '~/stores/persons'
import { useLocale } from '~/composables/useLocale'

const props = defineProps<{ product: Product }>()
const emit = defineEmits<{ toggle: []; delete: [id: string] }>()

const store = useEventsStore()
const authStore = useAuthStore()
const personsStore = usePersonsStore()
const { t } = useLocale()

const editing = ref(false)
const editPrice = ref(props.product.price ?? 0)

async function savePrice() {
  await store.updateProduct(props.product.id, { price: editPrice.value || null })
  editing.value = false
}

const person = computed(() =>
  props.product.personId ? personsStore.persons.find(p => p.id === props.product.personId) : null,
)

// The viewer's own person id (server-stamped on the event response).
const viewerPersonId = computed(() => store.currentEvent?.viewerPersonId ?? null)

const myOwnMark = computed(() =>
  viewerPersonId.value
    ? (props.product.marks ?? []).find(m => m.personId === viewerPersonId.value) ?? null
    : null,
)
const myDisplayQty = computed(() => Math.max(1, myOwnMark.value?.quantity ?? 1))

async function adjustQty(delta: number) {
  if (!canMark.value) return
  const current = myOwnMark.value?.quantity ?? 1
  const next = current + delta
  if (next < 1) {
    await store.setMark(props.product.id, { isPlanned: false, isPurchased: false })
    return
  }
  await store.setMark(props.product.id, { quantity: next })
}

async function togglePlanned() {
  if (!canMark.value) return
  await store.setMark(props.product.id, { isPlanned: !props.product.isPlanned })
}

const COLOR_MAP: Record<string, string> = {
  purple: 'bg-purple-500', blue: 'bg-blue-500', green: 'bg-green-500',
  yellow: 'bg-yellow-500', red: 'bg-red-500', pink: 'bg-pink-500',
  orange: 'bg-orange-500', teal: 'bg-teal-500',
}

// Left priority bar — must (2) rose, want (1) amber, normal transparent.
const priorityBar = computed(() =>
  props.product.priority === 2 ? 'bg-must' : props.product.priority === 1 ? 'bg-planned' : 'bg-transparent',
)

// Price colour follows state: bought emerald, planned amber, else ink.
const priceColor = computed(() =>
  props.product.isPurchased ? 'text-bought' : props.product.isPlanned ? 'text-planned' : 'text-ink',
)
const displayQtyMultiplier = computed(() => (props.product.isPurchased || props.product.isPlanned) ? myDisplayQty.value : props.product.quantity)

const canMark = computed(() => authStore.isLoggedIn && !!viewerPersonId.value)
</script>

<template>
  <div class="flex items-center gap-3.5 px-2.5 py-3 border-b border-line-hair last:border-0 group">
    <!-- checkbox -->
    <button
      type="button"
      class="w-5 h-5 rounded-md shrink-0 flex items-center justify-center transition-colors"
      :class="product.isPurchased ? 'bg-bought' : 'border-2 border-[#2a3a4e]'"
      :disabled="!canMark"
      @click="canMark && emit('toggle')"
    >
      <UIcon v-if="product.isPurchased" name="i-heroicons-check" class="w-3.5 h-3.5 text-on-accent" />
    </button>

    <!-- priority bar -->
    <span class="w-[3px] h-[26px] rounded-full shrink-0" :class="priorityBar" />

    <!-- body -->
    <div class="flex-1 min-w-0">
      <div class="flex items-center gap-2 flex-wrap">
        <!-- creator dot (editors only) -->
        <span
          v-if="person && authStore.isEditing"
          class="w-2.5 h-2.5 rounded-full shrink-0"
          :class="COLOR_MAP[person.color] ?? 'bg-sky'"
          :title="person.name"
        />
        <span class="text-[13.5px] font-semibold" :class="product.isPurchased ? 'line-through text-muted' : 'text-ink-strong'">
          {{ product.name }}
        </span>
        <span v-if="product.priority === 2" class="text-[9px] font-bold text-must bg-chip-must px-1.5 py-0.5 rounded-[5px]">{{ t('product.must') }}</span>
        <span v-else-if="product.priority === 1" class="text-[9px] font-bold text-planned bg-chip-planned px-1.5 py-0.5 rounded-[5px]">{{ t('product.want') }}</span>
        <!-- PLANNED toggle chip -->
        <button
          v-if="canMark"
          type="button"
          class="text-[9px] font-bold px-1.5 py-0.5 rounded-[5px] transition-colors"
          :class="product.isPlanned ? 'text-planned bg-chip-planned' : 'text-faint border border-line hover:text-planned hover:border-planned'"
          @click="togglePlanned"
        >{{ product.isPlanned ? t('catalog.planned') : t('catalog.planQ') }}</button>
        <span v-if="product.size" class="text-[9px] text-muted bg-line-soft px-1.5 py-0.5 rounded-[5px]">{{ product.size }}</span>
        <span v-if="product.category" class="text-[9px] text-sky-soft bg-chip-sky px-1.5 py-0.5 rounded-[5px]">{{ product.category }}</span>
        <span v-if="product.quantity > 1" class="text-[9px] text-conv-soft bg-chip-conv px-1.5 py-0.5 rounded-[5px]">×{{ product.quantity }}</span>
      </div>
      <p v-if="product.description" class="text-[11px] text-faint truncate mt-0.5">{{ product.description }}</p>
    </div>

    <!-- qty stepper -->
    <div
      v-if="(product.isPlanned || product.isPurchased) && canMark"
      class="flex items-center border border-line rounded-field bg-surface-2 shrink-0"
    >
      <button type="button" class="w-6 h-6 flex items-center justify-center text-muted hover:text-ink" :title="t('product.qtyDecrement')" @click="adjustQty(-1)">−</button>
      <span class="w-6 text-center mono text-xs text-ink">{{ myDisplayQty }}</span>
      <button type="button" class="w-6 h-6 flex items-center justify-center text-muted hover:text-ink" :title="t('product.qtyIncrement')" @click="adjustQty(1)">+</button>
    </div>

    <!-- price -->
    <div class="flex items-center gap-2 shrink-0">
      <div v-if="!editing" class="text-right min-w-[70px]">
        <template v-if="product.price">
          <div
            class="mono text-[13.5px] font-semibold"
            :class="[priceColor, authStore.isEditing ? 'cursor-pointer hover:underline' : '']"
            @click="authStore.isEditing && (editing = true, editPrice = product.price ?? 0)"
          >{{ (product.price * displayQtyMultiplier).toFixed(2) }}{{ product.currency }}</div>
          <PriceConverted :amount="product.price * displayQtyMultiplier" :currency="product.currency" variant="caption" />
        </template>
        <button
          v-else-if="authStore.isEditing"
          class="opacity-0 group-hover:opacity-100 text-faint hover:text-ink"
          @click="editing = true"
        >
          <UIcon name="i-heroicons-currency-euro" class="w-4 h-4" />
        </button>
      </div>
      <div v-else class="flex items-center gap-1">
        <input
          v-model.number="editPrice"
          type="number"
          class="w-20 px-2 py-1 rounded-field border border-line-focus bg-surface-2 text-xs text-ink mono outline-none"
          @keydown.enter="savePrice"
          @keydown.esc="editing = false"
        />
        <button class="w-6 h-6 rounded-field bg-bought text-on-accent flex items-center justify-center" @click="savePrice"><UIcon name="i-heroicons-check" class="w-3.5 h-3.5" /></button>
        <button class="w-6 h-6 rounded-field text-muted flex items-center justify-center" @click="editing = false"><UIcon name="i-heroicons-x-mark" class="w-3.5 h-3.5" /></button>
      </div>

      <button
        v-if="authStore.isEditing"
        class="opacity-0 group-hover:opacity-100 text-must hover:text-must shrink-0"
        @click="emit('delete', product.id)"
      >
        <UIcon name="i-heroicons-trash" class="w-4 h-4" />
      </button>
    </div>
  </div>
</template>
