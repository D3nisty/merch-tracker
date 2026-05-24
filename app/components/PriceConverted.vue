<script setup lang="ts">
import { useCurrencyStore } from '~/stores/currency'

/**
 * Renders a compact "≈ X EUR" caption beside a price. Hides itself when:
 *   - amount is null / 0
 *   - source currency already matches the display currency
 *   - rates haven't loaded yet (no flicker; the caption simply appears once
 *     the fetch resolves because the store entry is reactive)
 */
const props = defineProps<{
  amount: number | null | undefined
  currency: string
  // 'inline' (default): renders as a small muted caption in flow.
  // 'caption': adds an explicit "≈" prefix and wraps in a separate line.
  variant?: 'inline' | 'caption'
}>()

const store = useCurrencyStore()
const conv = computed(() => store.convert(props.amount ?? null, props.currency))

const formatted = computed(() => {
  if (!conv.value) return ''
  // Match Intl formatting to the page locale but lock currency to target.
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: conv.value.target,
      maximumFractionDigits: conv.value.value >= 100 ? 0 : 2,
    }).format(conv.value.value)
  } catch {
    return `${conv.value.value.toFixed(2)} ${conv.value.target}`
  }
})
</script>

<template>
  <span
    v-if="conv"
    :class="[
      'text-gray-500 font-mono whitespace-nowrap',
      variant === 'caption' ? 'block text-xs mt-0.5' : 'text-xs ml-1.5',
    ]"
    :title="`Rate: 1 ${currency} = ${conv.rate.toFixed(6)} ${conv.target} (${conv.provider}${conv.fellBack ? ' fallback' : ''})`"
  >≈ {{ formatted }}</span>
</template>
