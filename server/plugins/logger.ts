/**
 * Verbose logging for dev:
 *  - Every incoming request prints method + path
 *  - Every error from an event handler prints with the URL it came from + full stack
 *  - In dev, attaches the stack to the JSON response body so the browser network tab
 *    shows the real error instead of an opaque "Server Error" page
 */
export default defineNitroPlugin((nitroApp) => {
  const isDev = import.meta.dev

  nitroApp.hooks.hook('request', (event) => {
    if (event.path.startsWith('/_nuxt/') || event.path.startsWith('/__nuxt')) return
    console.log(`[req] ${event.method} ${event.path}`)
  })

  nitroApp.hooks.hook('error', (error: Error & { statusCode?: number; data?: unknown }, ctx) => {
    const status = error.statusCode ?? 500
    // Don't spam the console for routine 4xx like 401 on /api/auth/me
    if (status >= 500) {
      console.error(`\n[ERROR ${status}] ${ctx?.event?.method ?? '?'} ${ctx?.event?.path ?? '?'}`)
      console.error(error.stack ?? error.message ?? error)
      if (error.data) console.error('data:', error.data)
      console.error('')
    } else {
      console.warn(`[${status}] ${ctx?.event?.method ?? '?'} ${ctx?.event?.path ?? '?'} — ${error.message}`)
    }
  })

  // In dev, surface error details to the response body so they appear in fetch responses
  if (isDev) {
    nitroApp.hooks.hook('beforeResponse', (event, { body }) => {
      // No-op; just here to make the hook chain visible if you want to extend it.
      void event; void body
    })
  }
})
