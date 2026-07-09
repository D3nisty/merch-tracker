<script setup lang="ts">
import { useLocale, type Locale } from '~/composables/useLocale'

const { locale, setLocale } = useLocale()

const options: { value: Locale; flag: string; label: string }[] = [
  { value: 'en', flag: '🇬🇧', label: 'EN' },
  { value: 'de', flag: '🇩🇪', label: 'DE' },
]
</script>

<template>
  <div class="flex items-center rounded-field border border-line overflow-hidden text-xs font-semibold">
    <button
      v-for="opt in options"
      :key="opt.value"
      type="button"
      class="px-2.5 py-1.5 transition-colors flex items-center gap-1"
      :class="locale === opt.value
        ? 'bg-chip-sky text-sky-soft'
        : 'text-muted hover:bg-surface-2 hover:text-ink'"
      @click="setLocale(opt.value)"
    >
      <span>{{ opt.flag }}</span>
      <span class="hidden sm:inline">{{ opt.label }}</span>
    </button>
  </div>
</template>
