/**
 * Intercept 401 responses on the global $fetch:
 *  - Clear the local auth state so the navbar updates to "logged out"
 *  - Bounce to /login with the current path as `?redirect=`
 *
 * This handles the case where a session expires while the user is mid-action —
 * without it the UI would silently fail mutations with no feedback.
 */
import { useAuthStore } from '~/stores/auth'

export default defineNuxtPlugin(() => {
  const authStore = useAuthStore()

  globalThis.$fetch = $fetch.create({
    onResponseError({ response, request }) {
      if (response?.status !== 401) return

      // Don't redirect when /api/auth/me returns 401 (that's how it signals
      // "not logged in" during normal page loads), or when the user just
      // submitted bad credentials on the login form.
      const url = String(request)
      if (url.includes('/api/auth/me') || url.includes('/api/auth/login')) return

      authStore.user = null
      const here = window.location.pathname + window.location.search
      if (window.location.pathname !== '/login') {
        navigateTo('/login?redirect=' + encodeURIComponent(here))
      }
    },
  })
})
