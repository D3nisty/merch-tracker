import { defineStore } from 'pinia'

export interface AuthUser {
  id: string
  username: string
  role: 'admin' | 'editor' | 'user'
  personId: string | null
  person: { id: string; name: string; color: string } | null
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<AuthUser | null>(null)
  const fetching = ref(false)

  // Backwards compat — most of the app reads `isEditing` to decide whether to render
  // edit affordances. For now an admin/editor unlocks the editing UI; later this can
  // become per-resource permission checks.
  const isEditing = computed(() => user.value?.role === 'admin' || user.value?.role === 'editor')
  const isAdmin = computed(() => user.value?.role === 'admin')
  const isLoggedIn = computed(() => user.value !== null)

  async function fetchMe(headers?: Record<string, string>) {
    fetching.value = true
    try {
      user.value = await $fetch<AuthUser | null>('/api/auth/me', { headers })
    } catch {
      user.value = null
    } finally {
      fetching.value = false
    }
  }

  async function login(username: string, password: string): Promise<{ ok: true } | { ok: false; message: string }> {
    try {
      const u = await $fetch<AuthUser>('/api/auth/login', {
        method: 'POST',
        body: { username, password },
      })
      user.value = u
      return { ok: true }
    } catch (e: unknown) {
      const msg = (e as { data?: { message?: string }; message?: string })?.data?.message
        ?? (e as { message?: string })?.message
        ?? 'Login failed'
      return { ok: false, message: msg }
    }
  }

  async function logout() {
    try { await $fetch('/api/auth/logout', { method: 'POST' }) } catch {}
    user.value = null
  }

  async function updateMyProfile(data: { color?: string; name?: string }): Promise<{ ok: true } | { ok: false; message: string }> {
    try {
      await $fetch('/api/auth/me', { method: 'PUT', body: data })
      // Reflect locally without a full refetch
      if (user.value?.person) {
        if (data.color !== undefined) user.value.person.color = data.color
        if (data.name !== undefined) user.value.person.name = data.name
      }
      return { ok: true }
    } catch (e: unknown) {
      const msg = (e as { data?: { message?: string }; message?: string })?.data?.message
        ?? (e as { message?: string })?.message
        ?? 'Could not update profile'
      return { ok: false, message: msg }
    }
  }

  async function changePassword(currentPassword: string, newPassword: string): Promise<{ ok: true } | { ok: false; message: string }> {
    try {
      await $fetch('/api/auth/change-password', {
        method: 'POST',
        body: { currentPassword, newPassword },
      })
      return { ok: true }
    } catch (e: unknown) {
      const msg = (e as { data?: { message?: string }; message?: string })?.data?.message
        ?? (e as { message?: string })?.message
        ?? 'Could not change password'
      return { ok: false, message: msg }
    }
  }

  return { user, isEditing, isAdmin, isLoggedIn, fetching, fetchMe, login, logout, changePassword, updateMyProfile }
})
