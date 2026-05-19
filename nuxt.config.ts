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
    // Light-mode color overrides. The app's custom components are styled with
    // hardcoded dark-mode utility classes; this stylesheet remaps them to
    // light equivalents when the `dark` class is absent from <html>.
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
      ],
      meta: [
        { name: 'theme-color', content: '#a855f7' },
        { name: 'description', content: 'Plan and track merch purchases at anime conventions and travel destinations.' },
      ],
    },
  },

  typescript: {
    strict: true,
  },
})
