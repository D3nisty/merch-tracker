<script setup lang="ts">
import type { Event } from '~/stores/events'
import { formatEventDateRange } from '~/stores/events'
import { useAuthStore } from '~/stores/auth'
import { useLocale } from '~/composables/useLocale'

const props = defineProps<{ event: Event }>()
const { t } = useLocale()
const emit = defineEmits<{ delete: [id: string] }>()

const authStore = useAuthStore()

const isConvention = computed(() => props.event.type === 'convention')
const eventSlug = computed(() => props.event.slug ?? props.event.id)

const locationCount = computed(() =>
  props.event.locationCount ?? props.event.locations?.length ?? 0,
)
const totalBooths = computed(() =>
  props.event.boothCount ?? props.event.locations?.reduce((sum, l) => sum + (l.booths?.length ?? 0), 0) ?? 0,
)
const totalProducts = computed(() =>
  props.event.totalProducts ?? props.event.locations?.reduce((sum, l) =>
    sum + (l.booths?.reduce((s, b) => s + (b.products?.length ?? 0), 0) ?? 0), 0) ?? 0,
)
const purchasedProducts = computed(() =>
  props.event.purchasedProducts ?? props.event.locations?.reduce((sum, l) =>
    sum + (l.booths?.reduce((s, b) =>
      s + (b.products?.filter(p => p.isPurchased).length ?? 0), 0) ?? 0), 0) ?? 0,
)
const progress = computed(() => totalProducts.value ? Math.round((purchasedProducts.value / totalProducts.value) * 100) : 0)
const isDone = computed(() => totalProducts.value > 0 && purchasedProducts.value >= totalProducts.value)

// Money footer — only when the full location tree is hydrated (e.g. after
// opening the event). On the dashboard list only counts are available, so the
// footer gracefully falls back to bought/progress. No backend change.
function sumByCurrency(pred: (p: { isPlanned?: boolean; isPurchased?: boolean }) => boolean) {
  const map: Record<string, number> = {}
  for (const loc of props.event.locations ?? []) {
    for (const b of loc.booths ?? []) {
      for (const p of b.products ?? []) {
        if (!p.price || !pred(p)) continue
        map[p.currency] = (map[p.currency] ?? 0) + p.price * (p.quantity ?? 1)
      }
    }
  }
  return map
}
const hasTree = computed(() => !!props.event.locations?.length)
const plannedMoney = computed(() => (hasTree.value ? firstEntry(sumByCurrency(p => !!p.isPlanned)) : null))
const spentMoney = computed(() => (hasTree.value ? firstEntry(sumByCurrency(p => !!p.isPurchased)) : null))
function firstEntry(map: Record<string, number>) {
  const e = Object.entries(map).filter(([, v]) => Math.abs(v) > 0.005)[0]
  return e ? `${e[1].toFixed(0)} ${e[0]}` : null
}

const isShared = computed(() =>
  !!props.event.ownerId && !!authStore.user && props.event.ownerId !== authStore.user.id && !authStore.isAdmin,
)

const menuItems = computed(() => {
  const items: any[] = [
    { label: t('common.view'), icon: 'i-heroicons-eye', to: `/events/${eventSlug.value}` },
  ]
  if (isConvention.value) items.push({ label: t('events.hallPlan'), icon: 'i-heroicons-map', to: `/events/${eventSlug.value}/hallplan` })
  if (authStore.isEditing) items.push({ label: t('common.delete'), icon: 'i-heroicons-trash', click: () => emit('delete', props.event.id), class: 'text-must' })
  return [items]
})
</script>

<template>
  <div class="relative group">
    <NuxtLink :to="`/events/${eventSlug}`" class="block">
      <div
        class="rounded-window overflow-hidden bg-surface border transition-colors hover:border-line-focus"
        :class="isConvention ? 'border-[#2b2650]' : 'border-line'"
      >
        <!-- cover band -->
        <div
          class="h-[70px] relative flex items-end p-[11px]"
          :class="isConvention ? 'cover-conv' : 'cover-travel'"
        >
          <span
            class="text-[10px] font-bold uppercase tracking-[0.05em] text-on-accent px-2 py-[3px] rounded-[5px]"
            :class="isConvention ? 'bg-conv-soft' : 'bg-sky-soft'"
          >{{ isConvention ? t('events.convention') : t('events.travelType') }}</span>
          <div class="absolute top-[11px] right-3 flex items-center gap-1.5">
            <span v-if="isShared" class="text-[9px] font-bold text-bought bg-chip-bought px-1.5 py-0.5 rounded-[5px]">SHARED</span>
            <UIcon
              :name="isConvention ? 'i-heroicons-ticket' : 'i-heroicons-map'"
              class="w-6 h-6 opacity-40"
              :class="isConvention ? 'text-conv-soft' : 'text-sky-soft'"
            />
          </div>
        </div>
        <!-- body -->
        <div class="p-[15px]">
          <h3 class="text-[16px] font-bold text-ink-strong truncate">{{ event.name }}</h3>
          <p class="text-xs text-muted mt-0.5 truncate">
            <span v-if="event.location">{{ event.location }}</span>
            <span v-if="event.location && event.date"> · </span>
            <span v-if="event.date">{{ formatEventDateRange(event.date, event.dateTo) }}</span>
          </p>
          <div class="flex gap-3.5 mt-3 mb-3 text-[11.5px] text-muted">
            <span><b class="text-ink">{{ locationCount }}</b> {{ isConvention ? t('events.halls') : t('events.locations') }}</span>
            <span><b class="text-ink">{{ totalBooths }}</b> {{ isConvention ? t('events.booths') : t('events.shops') }}</span>
            <span class="text-bought"><b>{{ purchasedProducts }}</b>/{{ totalProducts }}</span>
          </div>
          <div class="h-1.5 rounded-full bg-line-soft overflow-hidden mb-3">
            <div
              class="h-full rounded-full"
              :class="isDone ? 'bg-bought' : (isConvention ? 'grad-progress-conv' : 'grad-progress')"
              :style="{ width: `${progress}%` }"
            />
          </div>
          <div class="flex items-center justify-between pt-3 border-t border-line-soft">
            <div>
              <div class="text-[9.5px] uppercase text-faint">{{ plannedMoney ? t('booth.planned') : t('event.purchased') }}</div>
              <div class="mono text-[13.5px] font-semibold" :class="plannedMoney ? 'text-planned' : (isDone ? 'text-faint' : 'text-bought')">
                {{ plannedMoney ?? (isDone ? '✓' : `${purchasedProducts}/${totalProducts}`) }}
              </div>
            </div>
            <div class="text-right">
              <div class="text-[9.5px] uppercase text-faint">{{ spentMoney ? t('booth.spent') : '%' }}</div>
              <div class="mono text-[13.5px] font-semibold text-bought">{{ spentMoney ?? `${progress}%` }}</div>
            </div>
          </div>
        </div>
      </div>
    </NuxtLink>

    <!-- kebab menu -->
    <div class="absolute top-2 right-2 z-10" @click.stop @mousedown.stop>
      <UDropdown :items="menuItems" :ui="{ background: 'bg-surface', ring: 'ring-1 ring-line', rounded: 'rounded-card' }">
        <button class="w-7 h-7 rounded-md bg-app/40 hover:bg-app/70 text-ink flex items-center justify-center transition-colors">
          <UIcon name="i-heroicons-ellipsis-vertical" class="w-4 h-4" />
        </button>
      </UDropdown>
    </div>
  </div>
</template>
