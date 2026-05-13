import { useAuthStore } from '~/stores/auth'
import { usePersonsStore } from '~/stores/persons'

export default defineNuxtPlugin(async () => {
  const authStore = useAuthStore()

  // On the server, forward the incoming request's Cookie header so the internal
  // $fetch to /api/auth/me sees the session and SSR renders in the right
  // logged-in state (avoids hydration mismatches).
  //
  // On the client, Pinia rehydrates the user state from the SSR payload, so
  // skip the redundant fetch unless that state is empty (direct client nav,
  // first ever load, etc.).
  if (import.meta.server) {
    await authStore.fetchMe(useRequestHeaders(['cookie']))
  } else if (!authStore.user) {
    await authStore.fetchMe()
  }

  // localStorage-backed person selection only makes sense client-side.
  if (import.meta.client) usePersonsStore().init()
})
