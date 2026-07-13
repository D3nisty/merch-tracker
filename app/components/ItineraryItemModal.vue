<script setup lang="ts">
import { useEventsStore, type Event, type ItineraryItem, type ItineraryKind, type ItineraryAttachment } from '~/stores/events'
import { useLocale } from '~/composables/useLocale'

const props = defineProps<{
  modelValue: boolean
  event: Event
  item?: ItineraryItem | null
  lockLocationId?: string | null
  defaultLocationId?: string | null
  defaultDate?: string | null
  defaultKind?: ItineraryKind
  canEdit?: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [v: boolean] }>()

const store = useEventsStore()
const { t } = useLocale()

const KINDS: { key: ItineraryKind; icon: string }[] = [
  { key: 'activity', icon: 'i-heroicons-map-pin' },
  { key: 'ticket', icon: 'i-heroicons-ticket' },
  { key: 'food', icon: 'i-heroicons-cake' },
  { key: 'transport', icon: 'i-heroicons-arrow-right-circle' },
  { key: 'shopping', icon: 'i-heroicons-shopping-bag' },
  { key: 'note', icon: 'i-heroicons-pencil' },
]
function kindLabel(k: ItineraryKind) {
  return t(`planner.kind${k.charAt(0).toUpperCase()}${k.slice(1)}` as any)
}

const cities = computed(() => (props.event.locations ?? []).filter(l => l.type !== 'hall'))
const isEdit = computed(() => !!props.item)
const cityLocked = computed(() => isEdit.value || !!props.lockLocationId)

const form = reactive({
  locationId: '' as string,
  kind: 'activity' as ItineraryKind,
  title: '', date: '', time: '', endTime: '', fromLoc: '', toLoc: '',
  price: '' as string | number, currency: 'EUR', url: '', notes: '',
})
const attachments = ref<ItineraryAttachment[]>([])
const pendingFiles = ref<File[]>([])
const saving = ref(false)

function seed() {
  const it = props.item
  if (it) {
    Object.assign(form, {
      locationId: it.locationId,
      kind: it.kind, title: it.title, date: it.date ?? '', time: it.time ?? '',
      endTime: it.endTime ?? '', fromLoc: it.fromLoc ?? '', toLoc: it.toLoc ?? '',
      price: it.price ?? '', currency: it.currency || 'EUR', url: it.url ?? '', notes: it.notes ?? '',
    })
    attachments.value = [...(it.attachments ?? [])]
  } else {
    Object.assign(form, {
      locationId: props.lockLocationId ?? props.defaultLocationId ?? cities.value[0]?.id ?? '',
      kind: props.defaultKind ?? 'activity', title: '', date: props.defaultDate ?? '',
      time: '', endTime: '', fromLoc: '', toLoc: '', price: '', currency: 'EUR', url: '', notes: '',
    })
    attachments.value = []
  }
  pendingFiles.value = []
}
watch(() => props.modelValue, (open) => { if (open) seed() })

const showPrice = computed(() => form.kind !== 'transport' && form.kind !== 'note')
const canSubmit = computed(() => {
  if (!form.locationId) return false
  if (form.kind === 'transport') return !!(form.title.trim() || form.fromLoc.trim() || form.toLoc.trim())
  return !!form.title.trim()
})

function patch() {
  return {
    kind: form.kind,
    title: form.title.trim() || (form.kind === 'transport' ? `${form.fromLoc || '?'} → ${form.toLoc || '?'}` : ''),
    date: form.date || null,
    time: form.time || null,
    endTime: form.kind === 'transport' ? (form.endTime || null) : null,
    fromLoc: form.kind === 'transport' ? (form.fromLoc || null) : null,
    toLoc: form.kind === 'transport' ? (form.toLoc || null) : null,
    price: showPrice.value && form.price !== '' && form.price != null ? Number(form.price) : null,
    currency: form.currency || 'EUR',
    url: form.url || null,
    notes: form.notes || null,
  }
}

async function save() {
  if (!canSubmit.value || saving.value) return
  saving.value = true
  try {
    if (props.item) {
      await store.updateItineraryItem(props.item.id, patch())
    } else {
      const created = await store.createItineraryItem({ locationId: form.locationId, ...patch() })
      if (pendingFiles.value.length) await store.uploadItineraryAttachments(created.id, pendingFiles.value)
    }
    emit('update:modelValue', false)
  } finally { saving.value = false }
}

async function remove() {
  if (!props.item) return
  await store.deleteItineraryItem(props.item.id)
  emit('update:modelValue', false)
}

// ── attachments (tickets / QR screenshots) ──────────────────────────────
const fileInput = ref<HTMLInputElement | null>(null)
const uploading = ref(false)
const isImage = (p: string) => /\.(png|jpe?g|gif|webp|heic|avif)$/i.test(p)
function pickFiles() { fileInput.value?.click() }
async function onFiles(e: Event) {
  const files = Array.from((e.target as HTMLInputElement).files ?? [])
  if (files.length) {
    if (props.item) {
      uploading.value = true
      try { attachments.value = await store.uploadItineraryAttachments(props.item.id, files) } finally { uploading.value = false }
    } else {
      pendingFiles.value = [...pendingFiles.value, ...files]
    }
  }
  if (fileInput.value) fileInput.value.value = ''
}
async function removeAttachment(a: ItineraryAttachment) {
  if (!props.item) return
  await store.deleteItineraryAttachment(props.item.id, a.id)
  attachments.value = attachments.value.filter(x => x.id !== a.id)
}
function removePending(i: number) { pendingFiles.value = pendingFiles.value.filter((_, idx) => idx !== i) }
</script>

<template>
  <UModal :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)" :ui="{ width: 'w-full sm:max-w-lg' }">
    <UCard>
      <template #header>
        <div class="flex items-center justify-between gap-3">
          <h3 class="font-bold text-ink-strong text-base flex items-center gap-2">
            <UIcon name="i-heroicons-calendar-days" class="w-4 h-4 text-sky" />
            {{ isEdit ? t('itemModal.editTitle') : t('itemModal.addTitle') }}
          </h3>
          <button type="button" class="text-faint hover:text-ink" @click="emit('update:modelValue', false)">
            <UIcon name="i-heroicons-x-mark" class="w-4.5 h-4.5" />
          </button>
        </div>
      </template>

      <div class="space-y-3 max-h-[68vh] overflow-y-auto pr-0.5">
        <!-- kind -->
        <div class="flex gap-1.5 flex-wrap">
          <button
            v-for="m in KINDS" :key="m.key" type="button"
            class="flex items-center gap-1 px-2.5 py-1.5 rounded-field border text-[11.5px] font-semibold transition-colors"
            :class="form.kind === m.key ? 'border-line-focus bg-chip-sky text-sky-soft' : 'border-line text-muted hover:border-line-focus'"
            @click="form.kind = m.key"
          ><UIcon :name="m.icon" class="w-3.5 h-3.5" /> {{ kindLabel(m.key) }}</button>
        </div>

        <!-- city -->
        <div>
          <label class="block text-[11px] text-muted mb-1">{{ t('itemModal.city') }}</label>
          <select
            v-model="form.locationId"
            :disabled="cityLocked"
            class="w-full px-3 py-2 rounded-field border border-line bg-surface-2 text-[13px] text-ink outline-none focus:border-line-focus disabled:opacity-60"
          >
            <option v-for="c in cities" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
        </div>

        <!-- title -->
        <input
          v-model="form.title"
          :placeholder="form.kind === 'transport' ? t('planner.transportModePlaceholder') : t('planner.titlePlaceholder')"
          class="w-full px-3 py-2 rounded-field border border-line bg-surface-2 text-[13px] text-ink outline-none focus:border-line-focus"
          @keydown.enter="save"
        />

        <!-- transport from → to -->
        <div v-if="form.kind === 'transport'" class="flex gap-2 items-center">
          <input v-model="form.fromLoc" :placeholder="t('planner.from')" class="flex-1 min-w-0 px-2.5 py-2 rounded-field border border-line bg-surface-2 text-[12px] text-ink outline-none" />
          <UIcon name="i-heroicons-arrow-long-right" class="w-4 h-4 text-faint shrink-0" />
          <input v-model="form.toLoc" :placeholder="t('planner.to')" class="flex-1 min-w-0 px-2.5 py-2 rounded-field border border-line bg-surface-2 text-[12px] text-ink outline-none" />
        </div>

        <!-- date / time / arrival -->
        <div class="flex gap-2 flex-wrap items-center">
          <label class="flex items-center gap-1 text-[11px] text-faint">
            {{ t('itemModal.date') }}
            <input v-model="form.date" type="date" class="px-2.5 py-2 rounded-field border border-line bg-surface-2 text-[12px] text-ink outline-none" />
          </label>
          <label class="flex items-center gap-1 text-[11px] text-faint">
            <span>{{ form.kind === 'transport' ? t('planner.depart') : t('itemModal.time') }}</span>
            <input v-model="form.time" type="time" class="px-2.5 py-2 rounded-field border border-line bg-surface-2 text-[12px] text-ink outline-none w-28" />
          </label>
          <label v-if="form.kind === 'transport'" class="flex items-center gap-1 text-[11px] text-faint">
            {{ t('planner.arrive') }}
            <input v-model="form.endTime" type="time" class="px-2.5 py-2 rounded-field border border-line bg-surface-2 text-[12px] text-ink outline-none w-28" />
          </label>
        </div>

        <!-- price + currency -->
        <div v-if="showPrice" class="flex gap-2 items-center">
          <input v-model="form.price" type="number" step="0.01" :placeholder="t('itemModal.price')" class="px-2.5 py-2 rounded-field border border-line bg-surface-2 text-[12px] text-ink outline-none w-28 mono" />
          <input v-model="form.currency" maxlength="3" :placeholder="t('itemModal.currency')" class="px-2.5 py-2 rounded-field border border-line bg-surface-2 text-[12px] text-ink outline-none w-20 uppercase mono" />
        </div>

        <!-- url -->
        <input v-model="form.url" :placeholder="t('planner.urlPlaceholder')" class="w-full px-3 py-2 rounded-field border border-line bg-surface-2 text-[12px] text-ink outline-none focus:border-line-focus" />

        <!-- notes -->
        <textarea v-model="form.notes" :placeholder="t('itemModal.notes')" rows="2" class="w-full px-3 py-2 rounded-field border border-line bg-surface-2 text-[12px] text-ink outline-none focus:border-line-focus resize-none" />

        <!-- attachments -->
        <div>
          <div class="flex items-center justify-between mb-1.5">
            <label class="text-[11px] text-muted">{{ t('itemModal.attachments') }}</label>
            <button type="button" class="flex items-center gap-1 text-[11px] text-sky-soft hover:text-sky" @click="pickFiles">
              <UIcon :name="uploading ? 'i-heroicons-arrow-path' : 'i-heroicons-paper-clip'" class="w-3.5 h-3.5" :class="uploading ? 'animate-spin' : ''" /> {{ t('itemModal.addFiles') }}
            </button>
          </div>
          <div v-if="attachments.length || pendingFiles.length" class="flex items-center gap-2 flex-wrap">
            <div v-for="att in attachments" :key="att.id" class="relative group/att">
              <a v-if="isImage(att.path)" :href="att.path" target="_blank" :title="att.name">
                <img :src="att.path" alt="" class="h-14 w-14 rounded-md border border-line object-cover" />
              </a>
              <a v-else :href="att.path" target="_blank" class="inline-flex items-center gap-1 px-2 py-1.5 rounded-md border border-line text-[11px] text-bought hover:border-bought" :title="att.name">
                <UIcon name="i-heroicons-document-text" class="w-3.5 h-3.5" /> {{ att.name.length > 16 ? att.name.slice(0, 14) + '…' : att.name }}
              </a>
              <button type="button" class="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-must text-chip-must flex items-center justify-center opacity-0 group-hover/att:opacity-100 transition-opacity" @click.stop="removeAttachment(att)"><UIcon name="i-heroicons-x-mark" class="w-2.5 h-2.5" /></button>
            </div>
            <div v-for="(f, i) in pendingFiles" :key="'p' + i" class="relative group/att">
              <span class="inline-flex items-center gap-1 px-2 py-1.5 rounded-md border border-dashed border-line-focus text-[11px] text-sky-soft" :title="f.name">
                <UIcon name="i-heroicons-clock" class="w-3.5 h-3.5" /> {{ f.name.length > 16 ? f.name.slice(0, 14) + '…' : f.name }}
              </span>
              <button type="button" class="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-must text-chip-must flex items-center justify-center opacity-0 group-hover/att:opacity-100 transition-opacity" @click.stop="removePending(i)"><UIcon name="i-heroicons-x-mark" class="w-2.5 h-2.5" /></button>
            </div>
          </div>
          <p v-else class="text-[11px] text-faint">{{ t('itemModal.noFiles') }}</p>
        </div>
      </div>

      <template #footer>
        <div class="flex items-center gap-2.5">
          <button v-if="isEdit" type="button" class="px-3 py-2 rounded-field text-[13px] font-semibold text-must hover:bg-chip-must/40" @click="remove">
            <UIcon name="i-heroicons-trash" class="w-4 h-4" />
          </button>
          <div class="flex-1" />
          <button type="button" class="px-4 py-2 rounded-field text-[13px] font-semibold text-muted hover:text-ink" @click="emit('update:modelValue', false)">{{ t('common.cancel') }}</button>
          <button type="button" class="px-4 py-2 rounded-field grad-primary text-[13px] font-bold disabled:opacity-50" :disabled="!canSubmit || saving" @click="save">{{ saving ? '…' : t('common.save') }}</button>
        </div>
      </template>

      <input ref="fileInput" type="file" accept="image/*,application/pdf" multiple class="hidden" @change="onFiles" />
    </UCard>
  </UModal>
</template>
