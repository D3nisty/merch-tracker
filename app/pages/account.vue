<script setup lang="ts">
import { useAuthStore } from '~/stores/auth'
import { usePersonsStore } from '~/stores/persons'
import { useLocale } from '~/composables/useLocale'

definePageMeta({ layout: 'default' })

const authStore = useAuthStore()
const personsStore = usePersonsStore()
const { t } = useLocale()
const router = useRouter()

useHead({ title: 'Account' })

const COLORS = ['purple', 'blue', 'green', 'yellow', 'red', 'pink', 'orange', 'teal'] as const
const COLOR_BG: Record<string, string> = {
  purple: 'bg-purple-500',
  blue: 'bg-blue-500',
  green: 'bg-green-500',
  yellow: 'bg-yellow-500',
  red: 'bg-red-500',
  pink: 'bg-pink-500',
  orange: 'bg-orange-500',
  teal: 'bg-teal-500',
}

const currentPassword = ref('')
const newPassword = ref('')
const error = ref('')
const success = ref(false)
const submitting = ref(false)

const colorError = ref('')
const colorSuccess = ref(false)

const displayName = ref('')
const nameError = ref('')
const nameSaving = ref(false)
const nameSuccess = ref(false)

onMounted(async () => {
  if (!authStore.user) await authStore.fetchMe()
  if (!authStore.isLoggedIn) router.replace('/login?redirect=/account')
  // Ensure persons list is loaded for the admin "view as" picker
  if (authStore.isAdmin && personsStore.persons.length === 0) {
    await personsStore.fetchPersons()
  }
  // Seed the display-name input with the current value
  displayName.value = authStore.user?.person?.name ?? authStore.user?.username ?? ''
})

// Keep the input synced if the auth store user changes elsewhere
watch(() => authStore.user?.person?.name, (n) => {
  if (n && n !== displayName.value) displayName.value = n
})

async function submit() {
  if (!currentPassword.value || newPassword.value.length < 6) {
    error.value = t('auth.passwordTooShort')
    return
  }
  submitting.value = true
  error.value = ''
  success.value = false
  const res = await authStore.changePassword(currentPassword.value, newPassword.value)
  submitting.value = false
  if (res.ok) {
    success.value = true
    currentPassword.value = ''
    newPassword.value = ''
  } else {
    error.value = res.message
  }
}

async function pickColor(color: string) {
  if (color === authStore.user?.person?.color) return
  colorError.value = ''
  colorSuccess.value = false
  const res = await authStore.updateMyProfile({ color })
  if (res.ok) {
    colorSuccess.value = true
    // The current view-as person is usually self — refresh the persons list so
    // colored dots in the rest of the UI pick up the change.
    await personsStore.fetchPersons()
  } else {
    colorError.value = res.message
  }
}

async function saveName() {
  const name = displayName.value.trim()
  if (!name || name === authStore.user?.person?.name) return
  if (name.length > 60) {
    nameError.value = 'Display name must be at most 60 characters.'
    return
  }
  nameError.value = ''
  nameSuccess.value = false
  nameSaving.value = true
  const res = await authStore.updateMyProfile({ name })
  nameSaving.value = false
  if (res.ok) {
    nameSuccess.value = true
    await personsStore.fetchPersons()
  } else {
    nameError.value = res.message
  }
}

// Admin: "view as another person" picker. Defaults to self.
const viewAsId = computed({
  get: () => personsStore.currentPersonId ?? '',
  set: (v: string) => personsStore.selectPerson(v || null),
})

const viewAsOptions = computed(() => [
  { value: authStore.user?.personId ?? '', label: t('auth.viewAsSelf') },
  ...personsStore.persons
    .filter(p => p.id !== authStore.user?.personId)
    .map(p => ({ value: p.id, label: p.name })),
])

// ── My purchases (per event) ──────────────────────────────────────────
// Lets the user spot doubled-up marks (legacy person + new user-person)
// and unmark them without diving back into each booth.
interface PurchaseItem {
  boothId: string
  boothSlug: string | null
  boothName: string
  productId: string
  productName: string
  size: string | null
  category: string | null
  price: number | null
  currency: string
  quantity: number     // per-person mark quantity
  defaultQty: number
  isPlanned: boolean
}
interface PurchaseGroup {
  eventId: string
  eventSlug: string | null
  eventName: string
  totals: Record<string, number>
  items: PurchaseItem[]
}
const purchases = ref<PurchaseGroup[]>([])
const purchasesLoading = ref(false)
const purchasesError = ref('')
const collapsedEvents = ref<Record<string, boolean>>({})
const confirmClearTarget = ref<{ scope: 'all' | 'event'; eventId?: string; eventName?: string } | null>(null)
// UModal needs a boolean v-model (project quirk in CLAUDE.md); we keep the
// target object as state and expose a writable boolean alias for the modal.
const showConfirmClear = computed({
  get: () => confirmClearTarget.value !== null,
  set: (v: boolean) => { if (!v) confirmClearTarget.value = null },
})

async function loadPurchases() {
  purchasesLoading.value = true
  purchasesError.value = ''
  try {
    purchases.value = await $fetch<PurchaseGroup[]>('/api/me/purchases')
  } catch (e) {
    purchasesError.value = e instanceof Error ? e.message : 'Failed to load'
  } finally {
    purchasesLoading.value = false
  }
}

async function unmarkSingle(item: PurchaseItem) {
  try {
    await $fetch(`/api/products/${item.productId}/marks`, {
      method: 'POST',
      body: { isPurchased: false },
    })
    // Optimistic local removal so the row disappears even if no refetch
    for (const g of purchases.value) {
      const idx = g.items.findIndex(it => it.productId === item.productId)
      if (idx !== -1) {
        const removed = g.items.splice(idx, 1)[0]!
        if (removed.price) {
          const cur = removed.currency || 'EUR'
          g.totals[cur] = (g.totals[cur] ?? 0) - removed.price * removed.quantity
          if (Math.abs(g.totals[cur]!) < 0.005) delete g.totals[cur]
        }
      }
    }
    purchases.value = purchases.value.filter(g => g.items.length > 0)
  } catch (e) {
    purchasesError.value = e instanceof Error ? e.message : 'Failed to unmark'
  }
}

// Change the qty on a purchased item. `next` < 1 routes to unmarkSingle.
async function adjustItemQty(item: PurchaseItem, next: number) {
  if (next < 1) return unmarkSingle(item)
  try {
    await $fetch(`/api/products/${item.productId}/marks`, {
      method: 'POST',
      body: { quantity: next },
    })
    // Apply locally
    for (const g of purchases.value) {
      const it = g.items.find(x => x.productId === item.productId)
      if (!it) continue
      const old = it.quantity
      it.quantity = next
      if (it.price) {
        const cur = it.currency || 'EUR'
        g.totals[cur] = (g.totals[cur] ?? 0) + it.price * (next - old)
      }
    }
  } catch (e) {
    purchasesError.value = e instanceof Error ? e.message : 'Failed to update'
  }
}

function confirmClear(group: PurchaseGroup | null) {
  confirmClearTarget.value = group
    ? { scope: 'event', eventId: group.eventId, eventName: group.eventName }
    : { scope: 'all' }
}

async function executeClear() {
  if (!confirmClearTarget.value) return
  const body = confirmClearTarget.value.scope === 'event'
    ? { eventId: confirmClearTarget.value.eventId }
    : {}
  confirmClearTarget.value = null
  try {
    await $fetch('/api/me/purchases', { method: 'DELETE', body })
    await loadPurchases()
  } catch (e) {
    purchasesError.value = e instanceof Error ? e.message : 'Failed to clear'
  }
}

onMounted(() => { loadPurchases() })
</script>

<template>
  <div v-if="authStore.user" class="max-w-md mx-auto">
    <UCard class="mb-4">
      <template #header>
        <h1 class="font-bold text-white text-lg">{{ t('auth.accountTitle') }}</h1>
      </template>
      <dl class="text-sm space-y-2">
        <div class="flex justify-between">
          <dt class="text-gray-400">{{ t('nav.username') }}</dt>
          <dd class="text-white font-medium">{{ authStore.user.username }}</dd>
        </div>
        <div class="flex justify-between">
          <dt class="text-gray-400">{{ t('auth.role') }}</dt>
          <dd class="text-white font-medium capitalize">{{ authStore.user.role }}</dd>
        </div>
      </dl>
    </UCard>

    <!-- Display name -->
    <UCard class="mb-4">
      <template #header>
        <h2 class="font-semibold text-white">{{ t('auth.displayName') }}</h2>
        <p class="text-xs text-gray-400 mt-0.5">{{ t('auth.displayNameDesc') }}</p>
      </template>
      <div class="flex gap-2">
        <UInput
          v-model="displayName"
          class="flex-1"
          maxlength="60"
          @keydown.enter="saveName"
        />
        <UButton
          color="purple"
          :loading="nameSaving"
          :disabled="!displayName.trim() || displayName.trim() === authStore.user?.person?.name"
          @click="saveName"
        >{{ t('common.save') }}</UButton>
      </div>
      <p v-if="nameError" class="text-red-400 text-xs mt-2">{{ nameError }}</p>
      <p v-if="nameSuccess" class="text-green-400 text-xs mt-2">{{ t('auth.profileUpdated') }}</p>
    </UCard>

    <!-- Identity color -->
    <UCard class="mb-4">
      <template #header>
        <h2 class="font-semibold text-white">{{ t('auth.yourColor') }}</h2>
        <p class="text-xs text-gray-400 mt-0.5">{{ t('auth.yourColorDesc') }}</p>
      </template>
      <div class="flex gap-2 flex-wrap">
        <button
          v-for="c in COLORS"
          :key="c"
          type="button"
          :class="[
            'w-9 h-9 rounded-full transition-all',
            COLOR_BG[c],
            authStore.user.person?.color === c
              ? 'ring-2 ring-white ring-offset-2 ring-offset-gray-900 scale-110'
              : 'hover:scale-105 opacity-80 hover:opacity-100',
          ]"
          :title="c"
          @click="pickColor(c)"
        />
      </div>
      <p v-if="colorError" class="text-red-400 text-xs mt-3">{{ colorError }}</p>
      <p v-if="colorSuccess" class="text-green-400 text-xs mt-3">{{ t('auth.colorUpdated') }}</p>
    </UCard>

    <!-- Admin: view as another person -->
    <UCard v-if="authStore.isAdmin" class="mb-4">
      <template #header>
        <h2 class="font-semibold text-white">{{ t('auth.viewAs') }}</h2>
        <p class="text-xs text-gray-400 mt-0.5">{{ t('auth.viewAsDesc') }}</p>
      </template>
      <USelect
        v-model="viewAsId"
        :options="viewAsOptions"
        option-attribute="label"
        value-attribute="value"
      />
    </UCard>

    <!-- My purchases — per event, with unmark/clear -->
    <UCard class="mb-4">
      <template #header>
        <div class="flex items-center justify-between gap-2">
          <div>
            <h2 class="font-semibold text-white">{{ t('purchases.title') }}</h2>
            <p class="text-xs text-gray-400 mt-0.5">{{ t('purchases.desc') }}</p>
          </div>
          <UButton
            v-if="purchases.length > 0"
            size="xs"
            variant="ghost"
            color="red"
            icon="i-heroicons-trash"
            :title="t('purchases.clearAll')"
            @click="confirmClear(null)"
          >
            {{ t('purchases.clearAll') }}
          </UButton>
        </div>
      </template>
      <UAlert v-if="purchasesError" color="red" variant="soft" :title="purchasesError" class="mb-3" />
      <p v-if="!purchasesLoading && purchases.length === 0" class="text-sm text-gray-500 text-center py-3">
        {{ t('purchases.empty') }}
      </p>
      <div v-else class="space-y-4">
        <div v-for="g in purchases" :key="g.eventId" class="rounded-lg bg-gray-950 border border-gray-800">
          <div class="flex items-center justify-between gap-2 px-3 py-2 border-b border-gray-800">
            <button
              type="button"
              class="flex items-center gap-2 text-left flex-1 min-w-0 text-sm text-white hover:text-purple-300 transition-colors"
              @click="collapsedEvents[g.eventId] = !collapsedEvents[g.eventId]"
            >
              <UIcon
                :name="collapsedEvents[g.eventId] ? 'i-heroicons-chevron-right' : 'i-heroicons-chevron-down'"
                class="w-3.5 h-3.5 shrink-0"
              />
              <span class="font-medium truncate">{{ g.eventName }}</span>
              <span class="text-xs text-gray-500 shrink-0">· {{ g.items.length }} {{ t('purchases.items') }}</span>
              <span v-if="Object.keys(g.totals).length" class="text-xs text-yellow-400 ml-auto shrink-0">
                <span v-for="([cur, amt], i) in Object.entries(g.totals)" :key="cur">
                  <span v-if="i > 0" class="text-gray-600"> · </span>{{ amt.toFixed(2) }} {{ cur }}
                </span>
              </span>
            </button>
            <UButton
              size="xs"
              variant="ghost"
              color="red"
              icon="i-heroicons-x-circle"
              :title="t('purchases.clearEvent')"
              @click="confirmClear(g)"
            />
          </div>
          <div v-show="!collapsedEvents[g.eventId]" class="divide-y divide-gray-800">
            <div
              v-for="item in g.items"
              :key="item.productId"
              class="flex items-center gap-2 px-3 py-2 text-sm"
            >
              <NuxtLink
                :to="`/events/${g.eventSlug ?? g.eventId}/booth/${item.boothSlug ?? item.boothId}`"
                class="flex-1 min-w-0 hover:text-purple-300 transition-colors"
              >
                <div class="text-white truncate">{{ item.productName }}</div>
                <div class="text-xs text-gray-500 truncate">
                  {{ item.boothName }}
                  <span v-if="item.size"> · {{ item.size }}</span>
                  <span v-if="item.category"> · {{ item.category }}</span>
                </div>
              </NuxtLink>
              <div class="flex items-center gap-0.5 shrink-0 rounded border border-gray-700 bg-gray-800/60">
                <button
                  type="button"
                  class="w-5 h-5 flex items-center justify-center text-gray-300 hover:text-white hover:bg-gray-700 rounded-l"
                  :title="t('product.qtyDecrement')"
                  @click="adjustItemQty(item, item.quantity - 1)"
                >−</button>
                <span class="px-1 text-xs font-mono tabular-nums text-white min-w-[1.25rem] text-center">{{ item.quantity }}</span>
                <button
                  type="button"
                  class="w-5 h-5 flex items-center justify-center text-gray-300 hover:text-white hover:bg-gray-700 rounded-r"
                  :title="t('product.qtyIncrement')"
                  @click="adjustItemQty(item, item.quantity + 1)"
                >+</button>
              </div>
              <span v-if="item.price" class="text-xs text-yellow-400 tabular-nums shrink-0">
                {{ (item.price * item.quantity).toFixed(2) }} {{ item.currency }}
              </span>
              <UButton
                size="xs"
                variant="ghost"
                color="gray"
                icon="i-heroicons-x-mark"
                :title="t('purchases.unmark')"
                @click="unmarkSingle(item)"
              />
            </div>
          </div>
        </div>
      </div>
    </UCard>

    <UCard>
      <template #header>
        <h2 class="font-semibold text-white">{{ t('auth.changePassword') }}</h2>
      </template>
      <form class="space-y-3" @submit.prevent="submit">
        <div>
          <label class="block text-xs text-gray-400 mb-1">{{ t('auth.currentPassword') }}</label>
          <UInput v-model="currentPassword" type="password" autocomplete="current-password" />
        </div>
        <div>
          <label class="block text-xs text-gray-400 mb-1">{{ t('auth.newPassword') }}</label>
          <UInput v-model="newPassword" type="password" autocomplete="new-password" />
        </div>
        <p v-if="error" class="text-red-400 text-xs">{{ error }}</p>
        <p v-if="success" class="text-green-400 text-xs">{{ t('auth.passwordChanged') }}</p>
      </form>
      <template #footer>
        <div class="flex justify-end">
          <UButton
            color="purple"
            :loading="submitting"
            :disabled="!currentPassword || newPassword.length < 6"
            @click="submit"
          >
            {{ t('common.save') }}
          </UButton>
        </div>
      </template>
    </UCard>

    <UModal v-model="showConfirmClear" :ui="{ width: 'sm:max-w-sm' }">
      <UCard v-if="confirmClearTarget">
        <template #header>
          <h3 class="font-semibold text-white">{{ t('purchases.confirmTitle') }}</h3>
        </template>
        <p class="text-sm text-gray-400">
          {{
            confirmClearTarget.scope === 'event'
              ? t('purchases.confirmEventDesc', { name: confirmClearTarget.eventName ?? '' })
              : t('purchases.confirmAllDesc')
          }}
        </p>
        <template #footer>
          <div class="flex gap-2 justify-end">
            <UButton variant="ghost" color="gray" @click="confirmClearTarget = null">{{ t('common.cancel') }}</UButton>
            <UButton color="red" @click="executeClear">{{ t('purchases.clear') }}</UButton>
          </div>
        </template>
      </UCard>
    </UModal>
  </div>
</template>
