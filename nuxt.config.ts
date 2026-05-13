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
