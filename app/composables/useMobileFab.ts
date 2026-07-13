import { ref } from 'vue'

/**
 * Context-aware mobile FAB (the center "+" in the bottom tab bar).
 *
 * A page registers its primary "add" action (booth → add product, trip → add
 * city, hall plan → add booth …); the layout renders + invokes it. When no
 * page has registered one, the layout falls back to "new event".
 *
 * Pages set it in `onMounted` and clear it in `onBeforeUnmount` (both
 * client-only), so SSR always renders the default and the next page never
 * inherits a stale action.
 */
export interface MobileFab {
  label: string
  icon?: string
  run: () => void
}

const fab = ref<MobileFab | null>(null)

export function useMobileFab() {
  return {
    fab,
    setFab: (action: MobileFab | null) => { fab.value = action },
    clearFab: () => { fab.value = null },
  }
}
