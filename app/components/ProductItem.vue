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

// Viewer's own mark + the per-person quantity displayed in the stepper.
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
    // Going below 1 means "un-mark everything" — drop BOTH flags. The server
    // deletes the row when both are false. This avoids stranded
    // planned-only rows when the user only intended "I'm buying 0 now".
    await store.setMark(props.product.id, { isPlanned: false, isPurchased: false })
    return
  }
  // Quantity-only update: server preserves both flag fields when they're
  // omitted from the body, so the user's planned-vs-purchased state is
  // unchanged (this is important: bumping qty must NOT silently flip
  // "planned" to "bought").
  await store.setMark(props.product.id, { quantity: next })
}

// Plan? toggle — independent from Bought? (you can plan, buy, or both).
async function togglePlanned() {
  if (!canMark.value) return
  await store.setMark(props.product.id, { isPlanned: !props.product.isPlanned })
}

// (Privacy) We intentionally do NOT expose who else has marked this product.
// Each viewer sees only their own mark state — the marks array is still
// served by the API so admins can see things via /admin tooling, but the
// rest of the UI keeps it private.

const COLOR_MAP: Record<string, string> = {
  purple: 'bg-purple-500',
  blue: 'bg-blue-500',
  green: 'bg-green-500',
  yellow: 'bg-yellow-500',
  red: 'bg-red-500',
  pink: 'bg-pink-500',
  orange: 'bg-orange-500',
  teal: 'bg-teal-500',
}

const priorityColors: Record<number, string> = {
  0: '',
  1: 'border-l-2 border-l-yellow-500',
  2: 'border-l-2 border-l-red-500',
}

// Any logged-in viewer with a person can mark for themselves — view-share
// users included. Guests (no session) still see a disabled checkbox.
const canMark = computed(() => authStore.isLoggedIn && !!viewerPersonId.value)
</script>

<template>
  <div
    :class="[
      'flex items-center gap-3 p-3 rounded-lg bg-gray-900 hover:bg-gray-800/80 transition-colors group',
      priorityColors[product.priority] ?? '',
    ]"
  >
    <UCheckbox
      :model-value="product.isPurchased"
      :disabled="!canMark"
      @change="canMark && emit('toggle')"
    />

    <!-- Plan? toggle (orange). Independent from Bought — you can plan AND
         buy. Same UX as the article-gallery Plan? button so view-share users
         already know what to do. Hidden for guests with no person. -->
    <button
      v-if="canMark"
      type="button"
      class="text-xs px-2 py-0.5 rounded-full border transition-colors font-medium shrink-0"
      :class="product.isPlanned ? 'bg-orange-600 border-orange-500 text-white' : 'border-gray-700 text-gray-400 hover:border-orange-500 hover:text-orange-400'"
      @click="togglePlanned"
    >{{ product.isPlanned ? t('catalog.planned') : t('catalog.planQ') }}</button>

    <!-- Per-person qty stepper, shown whenever the viewer has ANY mark on
         this product (planned, purchased, or both). `−` at qty=1 un-marks
         entirely (drops both flags). `+` only updates quantity, never flips
         a planned-only mark into "purchased". -->
    <div
      v-if="(product.isPlanned || product.isPurchased) && canMark"
      class="flex items-center gap-0.5 shrink-0 rounded border border-gray-700 bg-gray-800/60"
    >
      <button
        type="button"
        class="w-5 h-5 flex items-center justify-center text-gray-300 hover:text-white hover:bg-gray-700 rounded-l"
        :title="t('product.qtyDecrement')"
        @click="adjustQty(-1)"
      >−</button>
      <span class="px-1 text-xs font-mono tabular-nums text-white min-w-[1.25rem] text-center">{{ myDisplayQty }}</span>
      <button
        type="button"
        class="w-5 h-5 flex items-center justify-center text-gray-300 hover:text-white hover:bg-gray-700 rounded-r"
        :title="t('product.qtyIncrement')"
        @click="adjustQty(1)"
      >+</button>
    </div>

    <div class="flex-1 min-w-0">
      <div class="flex items-center gap-2 flex-wrap">
        <!-- Creator dot (hidden for guests) -->
        <span
          v-if="person && authStore.isEditing"
          :class="['w-2.5 h-2.5 rounded-full shrink-0', COLOR_MAP[person.color] ?? 'bg-purple-500']"
          :title="person.name"
        />
        <span :class="['font-medium text-sm', product.isPurchased ? 'line-through text-gray-500' : 'text-white']">
          {{ product.name }}
        </span>
        <UBadge v-if="product.size" :label="product.size" size="xs" variant="soft" color="gray" />
        <UBadge v-if="product.category" :label="product.category" size="xs" variant="soft" color="blue" />
        <UBadge v-if="product.quantity > 1" :label="`×${product.quantity}`" size="xs" variant="soft" color="purple" />
        <UBadge v-if="product.priority === 1" :label="t('product.want')" size="xs" variant="soft" color="yellow" />
        <UBadge v-if="product.priority === 2" :label="t('product.must')" size="xs" variant="soft" color="red" />
      </div>
      <p v-if="product.description" class="text-xs text-gray-500 truncate">{{ product.description }}</p>
    </div>

    <!-- Price -->
    <div class="flex items-center gap-2 shrink-0">
      <div v-if="!editing" class="text-right">
        <span
          v-if="product.price"
          class="text-yellow-400 text-sm font-medium"
          :class="authStore.isEditing ? 'cursor-pointer hover:underline' : ''"
          @click="authStore.isEditing && (editing = true, editPrice = product.price ?? 0)"
        >
          {{ (product.price * ((product.isPurchased || product.isPlanned) ? myDisplayQty : product.quantity)).toFixed(2) }}{{ product.currency }}
        </span>
        <PriceConverted
          v-if="product.price"
          :amount="product.price * ((product.isPurchased || product.isPlanned) ? myDisplayQty : product.quantity)"
          :currency="product.currency"
          variant="caption"
        />
        <UButton
          v-else-if="authStore.isEditing"
          variant="ghost"
          color="gray"
          size="xs"
          icon="i-heroicons-currency-euro"
          class="opacity-0 group-hover:opacity-100"
          @click="editing = true"
        />
      </div>
      <div v-else class="flex items-center gap-1">
        <UInput
          v-model.number="editPrice"
          type="number"
          size="xs"
          class="w-20"
          @keydown.enter="savePrice"
          @keydown.esc="editing = false"
          autofocus
        />
        <UButton size="xs" color="green" icon="i-heroicons-check" @click="savePrice" />
        <UButton size="xs" color="gray" variant="ghost" icon="i-heroicons-x-mark" @click="editing = false" />
      </div>

      <UButton
        v-if="authStore.isEditing"
        icon="i-heroicons-trash"
        variant="ghost"
        color="red"
        size="xs"
        class="opacity-0 group-hover:opacity-100"
        @click="emit('delete', product.id)"
      />
    </div>
  </div>
</template>
