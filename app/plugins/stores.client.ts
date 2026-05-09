import { useAuthStore } from '~/stores/auth'
import { usePersonsStore } from '~/stores/persons'

export default defineNuxtPlugin(() => {
  useAuthStore().init()
  usePersonsStore().init()
})
