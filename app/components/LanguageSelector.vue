<script setup lang="ts">
import { useLocale, type Locale } from '~/composables/useLocale'

const { locale, setLocale } = useLocale()

const options: { value: Locale; flag: string; label: string }[] = [
  { value: 'en', flag: '🇬🇧', label: 'EN' },
  { value: 'de', flag: '🇩🇪', label: 'DE' },
]
</script>

<template>
  <div class="flex items-center rounded border border-gray-700 overflow-hidden text-xs font-medium">
    <button
      v-for="opt in options"
      :key="opt.value"
      type="button"
      class="px-2 py-1.5 transition-colors flex items-center gap-1"
      :class="locale === opt.value
        ? 'bg-purple-600 text-white'
        : 'text-gray-400 hover:bg-gray-800 hover:text-white'"
      @click="setLocale(opt.value)"
    >
      <span>{{ opt.flag }}</span>
      <span class="hidden sm:inline">{{ opt.label }}</span>
    </button>
  </div>
</template>
