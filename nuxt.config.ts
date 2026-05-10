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

  typescript: {
    strict: true,
  },
})
