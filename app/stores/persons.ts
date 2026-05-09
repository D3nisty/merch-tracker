import { defineStore } from 'pinia'

export interface Person {
  id: string
  name: string
  color: string
  createdAt: string
}

const COLORS = ['purple', 'blue', 'green', 'yellow', 'red', 'pink', 'orange', 'teal']

export const usePersonsStore = defineStore('persons', () => {
  const persons = ref<Person[]>([])
  const currentPersonId = ref<string | null>(null)

  const currentPerson = computed(() =>
    persons.value.find(p => p.id === currentPersonId.value) ?? null,
  )

  function init() {
    const saved = localStorage.getItem('merch-current-person')
    if (saved) currentPersonId.value = saved

    watch(currentPersonId, (id) => {
      if (id) localStorage.setItem('merch-current-person', id)
      else localStorage.removeItem('merch-current-person')
    })
  }

  async function fetchPersons() {
    persons.value = await $fetch<Person[]>('/api/persons')
    if (currentPersonId.value && !persons.value.find(p => p.id === currentPersonId.value)) {
      currentPersonId.value = null
    }
  }

  async function createPerson(name: string) {
    const color = COLORS[persons.value.length % COLORS.length]
    const created = await $fetch<Person>('/api/persons', { method: 'POST', body: { name, color } })
    persons.value.push(created)
    return created
  }

  async function deletePerson(id: string) {
    await $fetch(`/api/persons/${id}`, { method: 'DELETE' })
    persons.value = persons.value.filter(p => p.id !== id)
    if (currentPersonId.value === id) currentPersonId.value = null
  }

  function selectPerson(id: string | null) {
    currentPersonId.value = id
  }

  return { persons, currentPersonId, currentPerson, init, fetchPersons, createPerson, deletePerson, selectPerson }
})
