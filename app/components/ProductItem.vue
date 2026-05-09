<script setup lang="ts">
import type { Product } from '~/stores/events'
import { useEventsStore } from '~/stores/events'

const props = defineProps<{ product: Product }>()
const emit = defineEmits<{ toggle: []; delete: [id: string] }>()

const store = useEventsStore()
const editing = ref(false)
const editPrice = ref(props.product.price ?? 0)

async function savePrice() {
  await store.updateProduct(props.product.id, { price: editPrice.value || null })
  editing.value = false
}

const priorityColors: Record<number, string> = {
  0: '',
  1: 'border-l-2 border-l-yellow-500',
  2: 'border-l-2 border-l-red-500',
}
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
      @change="emit('toggle')"
    />

    <div class="flex-1 min-w-0">
      <div class="flex items-center gap-2">
        <span :class="['font-medium text-sm', product.isPurchased ? 'line-through text-gray-500' : 'text-white']">
          {{ product.name }}
        </span>
        <UBadge v-if="product.size" :label="product.size" size="xs" variant="soft" color="gray" />
        <UBadge v-if="product.category" :label="product.category" size="xs" variant="soft" color="blue" />
        <UBadge v-if="product.quantity > 1" :label="`×${product.quantity}`" size="xs" variant="soft" color="purple" />
        <UBadge v-if="product.priority === 1" label="Want" size="xs" variant="soft" color="yellow" />
        <UBadge v-if="product.priority === 2" label="Must" size="xs" variant="soft" color="red" />
      </div>
      <p v-if="product.description" class="text-xs text-gray-500 truncate">{{ product.description }}</p>
    </div>

    <!-- Price -->
    <div class="flex items-center gap-2 shrink-0">
      <div v-if="!editing" class="text-right">
        <span
          v-if="product.price"
          class="text-yellow-400 text-sm font-medium cursor-pointer hover:underline"
          @click="editing = true; editPrice = product.price ?? 0"
        >
          {{ (product.price * product.quantity).toFixed(2) }}{{ product.currency }}
        </span>
        <UButton
          v-else
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
