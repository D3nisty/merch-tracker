/**
 * Client-side error visibility for dev.
 *  - Catches Vue render/setup errors (vueApp.config.errorHandler + 'vue:error' hook)
 *  - Catches unhandled promise rejections (e.g. failed $fetch)
 *  - Catches window-level errors (script errors, etc.)
 *
 * All routes through console.error so the browser DevTools console shows them
 * instead of failing silently or only flashing as a Nuxt error overlay.
 */
export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.vueApp.config.errorHandler = (err, _instance, info) => {
    console.error('[vue] error:', info, err)
  }

  nuxtApp.hook('vue:error', (err, _instance, info) => {
    console.error('[nuxt vue:error]', info, err)
  })

  nuxtApp.hook('app:error', (err) => {
    console.error('[nuxt app:error]', err)
  })

  if (typeof window !== 'undefined') {
    window.addEventListener('unhandledrejection', (e) => {
      console.error('[unhandledrejection]', e.reason)
    })
    window.addEventListener('error', (e) => {
      console.error('[window.error]', e.error ?? e.message)
    })
  }
})
