<script setup lang="ts">
import { useEventsStore } from '~/stores/events'
import type { Booth } from '~/stores/events'
import { useLocale } from '~/composables/useLocale'

const props = defineProps<{
  modelValue: boolean
  booth: Booth
}>()
const emit = defineEmits<{ 'update:modelValue': [v: boolean] }>()

const store = useEventsStore()
const { t } = useLocale()
const submitting = ref(false)
const error = ref('')

function parseCategories(raw: string | null | undefined): string[] {
  return (raw ?? '').split(',').map(c => c.trim()).filter(Boolean)
}

const form = reactive({
  name: props.booth.name,
  boothNr: props.booth.boothNr ?? '',
  hallNr: props.booth.hallNr ?? '',
  website: props.booth.website ?? '',
  notes: props.booth.notes ?? '',
  shopCategories: parseCategories(props.booth.shopCategory),
  iconPath: props.booth.iconPath ?? '',
})

// Re-seed when a different booth opens the modal (shouldn't happen with the
// current usage but guards against surprise).
watch(() => props.booth, (b) => {
  form.name = b.name
  form.boothNr = b.boothNr ?? ''
  form.hallNr = b.hallNr ?? ''
  form.website = b.website ?? ''
  form.notes = b.notes ?? ''
  form.shopCategories = parseCategories(b.shopCategory)
  form.iconPath = b.iconPath ?? ''
})

// Pill-chip category picker — same UX as the catalog Quick Add form and the
// discount-scope chooser. Default catalogue + values already on this booth
// + any custom values typed via the inline `+` button (session-scoped).
const DEFAULT_BOOTH_CATS = ['Print', 'Keychain', 'Sticker', 'Acrylic Figure', 'Figure', 'Mousepad', 'Shirt', 'Pin', 'Plush', 'Other']
const customBoothCats = ref<string[]>([])

function uniqueOrdered(...lists: string[][]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const list of lists) for (const v of list) {
    if (v && !seen.has(v)) { seen.add(v); out.push(v) }
  }
  return out
}

const categoryPills = computed(() =>
  uniqueOrdered(DEFAULT_BOOTH_CATS, form.shopCategories, customBoothCats.value),
)

function toggleCategory(c: string) {
  const idx = form.shopCategories.indexOf(c)
  if (idx === -1) form.shopCategories.push(c)
  else form.shopCategories.splice(idx, 1)
}

// Inline "+ add custom" state — same single-row pattern used elsewhere.
const addingCustom = ref(false)
const customDraft = ref('')
function startAddCustom() {
  customDraft.value = ''
  addingCustom.value = true
}
function cancelAddCustom() {
  addingCustom.value = false
  customDraft.value = ''
}
function commitCustom() {
  const v = customDraft.value.trim()
  addingCustom.value = false
  customDraft.value = ''
  if (!v) return
  if (!categoryPills.value.includes(v)) customBoothCats.value.push(v)
  if (!form.shopCategories.includes(v)) form.shopCategories.push(v)
}

// File-picker for icon upload — same as the inline avatar on the page, but
// reachable here too for users who'd rather edit everything in one place.
const iconInputRef = ref<HTMLInputElement | null>(null)
async function handleIconFile(e: Event) {
  const target = e.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return
  error.value = ''
  try {
    const res = await store.uploadBoothIcon(props.booth.id, file)
    form.iconPath = res.iconPath
  } catch (err) {
    error.value = (err as { data?: { message?: string } })?.data?.message ?? 'Upload failed'
  } finally {
    target.value = ''
  }
}

function clearIcon() {
  form.iconPath = ''
}

async function handleSubmit() {
  if (!form.name.trim()) return
  submitting.value = true
  error.value = ''
  try {
    await store.updateBooth(props.booth.id, {
      name: form.name.trim(),
      boothNr: form.boothNr.trim() || null,
      hallNr: form.hallNr.trim() || null,
      website: form.website.trim() || null,
      notes: form.notes.trim() || null,
      // Serialise selected chips back to the comma-separated string format
      // the rest of the app already reads (`booth.shopCategory.split(',')`).
      shopCategory: form.shopCategories.length ? form.shopCategories.join(', ') : null,
      iconPath: form.iconPath.trim() || null,
    })
    emit('update:modelValue', false)
  } catch (err) {
    error.value = (err as { data?: { message?: string } })?.data?.message ?? 'Failed to save'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <UModal :model-value="modelValue" :ui="{ width: 'sm:max-w-md' }"
    @update:model-value="emit('update:modelValue', $event)">
    <UCard>
      <template #header>
        <h3 class="font-semibold text-white">{{ t('editBooth.title') }}</h3>
      </template>

      <form @submit.prevent="handleSubmit" class="space-y-3">
        <!-- Icon row — preview + upload-replace + URL field + clear. -->
        <UFormGroup :label="t('editBooth.icon')">
          <div class="flex items-center gap-3">
            <div class="shrink-0 w-12 h-12 rounded-lg overflow-hidden flex items-center justify-center bg-gray-800 border border-gray-700">
              <img v-if="form.iconPath" :src="form.iconPath" alt="" class="w-full h-full object-cover" />
              <UIcon v-else name="i-heroicons-shopping-bag" class="w-5 h-5 text-gray-500" />
            </div>
            <div class="flex-1 min-w-0 space-y-1.5">
              <UInput v-model="form.iconPath" :placeholder="t('editBooth.iconUrlPlaceholder')" size="sm" />
              <div class="flex gap-1.5">
                <UButton size="xs" variant="outline" color="gray" icon="i-heroicons-arrow-up-tray" @click="iconInputRef?.click()">
                  {{ t('editBooth.uploadIcon') }}
                </UButton>
                <UButton v-if="form.iconPath" size="xs" variant="ghost" color="gray" icon="i-heroicons-x-mark" @click="clearIcon">
                  {{ t('editBooth.clearIcon') }}
                </UButton>
              </div>
            </div>
            <input ref="iconInputRef" type="file" accept="image/*" class="hidden" @change="handleIconFile" />
          </div>
        </UFormGroup>

        <UFormGroup :label="t('common.name')" required>
          <UInput v-model="form.name" autofocus />
        </UFormGroup>

        <div class="grid grid-cols-2 gap-3">
          <UFormGroup :label="t('booth.hallLabel')">
            <UInput v-model="form.hallNr" />
          </UFormGroup>
          <UFormGroup :label="t('booth.boothNrLabel')">
            <UInput v-model="form.boothNr" />
          </UFormGroup>
        </div>

        <UFormGroup :label="t('common.website')">
          <UInput v-model="form.website" placeholder="https://…" />
        </UFormGroup>

        <UFormGroup :label="t('editBooth.categories')" :help="t('editBooth.categoriesHelp')">
          <!-- Multi-select pill row — same UX as the Quick Add form in the
               catalog viewer and the discount-scope picker. Click to toggle
               a category in/out of the booth's tag list; the trailing dashed
               "+" pill opens an inline input for adding a custom value. -->
          <div class="flex flex-wrap gap-1 items-center">
            <button
              v-for="c in categoryPills" :key="c" type="button"
              class="px-1.5 py-0.5 text-xs rounded border transition-colors"
              :class="form.shopCategories.includes(c)
                ? 'bg-purple-600 border-purple-500 text-white'
                : 'border-gray-700 text-gray-400 hover:border-gray-500'"
              @click="toggleCategory(c)"
            >{{ c }}</button>
            <template v-if="addingCustom">
              <UInput
                v-model="customDraft" :placeholder="t('catalog.addCustomCategory')"
                size="xs" class="w-28" autofocus
                @keyup.enter="commitCustom" @keyup.escape="cancelAddCustom"
              />
              <button type="button" class="px-1 text-xs text-gray-400 hover:text-white" @click="cancelAddCustom">✕</button>
            </template>
            <button
              v-else type="button" :title="t('catalog.addCustomCategory')"
              class="px-1.5 py-0.5 text-xs rounded border border-dashed border-gray-600 text-gray-500 hover:border-purple-500 hover:text-purple-300 transition-colors"
              @click="startAddCustom"
            >+</button>
          </div>
        </UFormGroup>

        <UFormGroup :label="t('common.notes')">
          <UTextarea v-model="form.notes" :rows="3" />
        </UFormGroup>

        <p v-if="error" class="text-red-400 text-xs">{{ error }}</p>
      </form>

      <template #footer>
        <div class="flex gap-2 justify-end">
          <UButton variant="ghost" color="gray" @click="emit('update:modelValue', false)">{{ t('common.cancel') }}</UButton>
          <UButton color="purple" :loading="submitting" :disabled="!form.name.trim()" @click="handleSubmit">{{ t('common.save') }}</UButton>
        </div>
      </template>
    </UCard>
  </UModal>
</template>
