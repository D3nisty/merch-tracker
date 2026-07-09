export default defineNuxtConfig({
  compatibilityDate: '2024-11-01',
  future: { compatibilityVersion: 4 },
  devtools: { enabled: true },

  modules: [
    '@nuxt/ui',
    '@pinia/nuxt',
    '@vueuse/nuxt',
  ],

  ui: {
    global: true,
  },

  colorMode: {
    preference: 'dark',
  },

  css: [
    // Nomad design system: token CSS variables (dark + light), base
    // typography (Sora / Public Sans / IBM Plex Mono) and gradient helpers.
    // Loaded first so its base rules are the foundation everything sits on.
    '~/assets/css/nomad.css',
    // Legacy light-mode color overrides for any components still using the
    // old hardcoded `bg-gray-*` utilities. Nomad tokens theme themselves via
    // CSS vars; this stays as a safety net during/after the migration.
    '~/assets/css/light-mode.css',
    // Scales the root font-size up on wide screens so rem-based Tailwind
    // utilities (text, spacing, sizing) all grow together — equivalent to a
    // built-in 125-150% browser zoom on big displays. Mobile/tablet keep
    // the 16px default.
    '~/assets/css/responsive-scale.css',
  ],

  runtimeConfig: {
    dbPath: './data/merch-tracker.db',
  },

  app: {
    head: {
      title: 'MerchTracker',
      titleTemplate: (chunk?: string) => chunk && chunk !== 'MerchTracker' ? `${chunk} — MerchTracker` : 'MerchTracker',
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        // Nomad type system — Sora (display), Public Sans (body), IBM Plex Mono (money)
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&family=Public+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap',
        },
      ],
      meta: [
        { name: 'theme-color', content: '#38bdf8' },
        { name: 'description', content: 'Plan and track merch purchases at anime conventions and travel destinations.' },
      ],
    },
  },

  typescript: {
    strict: true,
  },
})
