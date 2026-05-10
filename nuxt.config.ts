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

  nitro: {
    publicAssets: [
      {
        baseURL: '/uploads',
        // Absolute path so it works regardless of WORKDIR.
        // In dev, Nuxt serves ./public/uploads/ automatically via the built-in static handler.
        dir: '/app/uploads',
        maxAge: 60 * 60 * 24 * 365,
      },
    ],
  },

  typescript: {
    strict: true,
  },
})
