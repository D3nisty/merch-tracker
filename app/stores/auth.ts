import { defineStore } from 'pinia'

const PASSWORD = 'Fichs'

export const useAuthStore = defineStore('auth', () => {
  const isEditing = ref(false)

  function init() {
    isEditing.value = localStorage.getItem('merch-editing') === '1'
  }

  watch(isEditing, (val) => {
    localStorage.setItem('merch-editing', val ? '1' : '0')
  })

  function tryUnlock(password: string): boolean {
    if (password === PASSWORD) {
      isEditing.value = true
      return true
    }
    return false
  }

  function lock() {
    isEditing.value = false
  }

  return { isEditing, init, tryUnlock, lock }
})
