<script setup lang="ts">
import { useLocale } from '~/composables/useLocale'
import type { Booth, Location } from '~/stores/events'

type QrScannerType = typeof import('qr-scanner').default
type QrScannerInst = InstanceType<QrScannerType>

const props = defineProps<{
  modelValue: boolean
  eventSlug: string
  locations: Location[]
}>()
const emit = defineEmits<{ 'update:modelValue': [v: boolean] }>()

const { t } = useLocale()

const videoRef = ref<HTMLVideoElement | null>(null)
let scanner: QrScannerInst | null = null
const state = ref<'idle' | 'starting' | 'scanning' | 'error'>('idle')
const errorMsg = ref<string | null>(null)
const lastScannedUrl = ref<string | null>(null)
const noMatchUrl = ref<string | null>(null)
let lastHandledAt = 0

function close() {
  stopScanner()
  emit('update:modelValue', false)
}

function stopScanner() {
  if (scanner) {
    try { scanner.stop() } catch { /* noop */ }
    try { scanner.destroy() } catch { /* noop */ }
    scanner = null
  }
  state.value = 'idle'
}

function normUrl(s: string | null | undefined): string {
  if (!s) return ''
  return s.trim().toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/+$/, '')
}

function lastPathSegment(url: string): string {
  const norm = normUrl(url)
  if (!norm) return ''
  const afterHost = norm.split('?')[0]?.split('#')[0] ?? ''
  const parts = afterHost.split('/').filter(Boolean)
  return parts[parts.length - 1] ?? ''
}

function findBoothByUrl(rawUrl: string): Booth | null {
  const target = normUrl(rawUrl)
  if (!target) return null
  const allBooths = props.locations.flatMap(l => l.booths ?? [])
  for (const b of allBooths) {
    if (b.website && normUrl(b.website) === target) return b
  }
  for (const b of allBooths) {
    const w = normUrl(b.website)
    if (w && (target.startsWith(w) || w.startsWith(target))) return b
  }
  const seg = lastPathSegment(rawUrl)
  if (seg) {
    for (const b of allBooths) {
      if (b.slug && b.slug.toLowerCase() === seg) return b
    }
    for (const b of allBooths) {
      if (b.name.toLowerCase().includes(seg)) return b
    }
  }
  return null
}

async function startScanner() {
  errorMsg.value = null
  noMatchUrl.value = null
  lastScannedUrl.value = null
  if (!videoRef.value) return
  state.value = 'starting'
  try {
    const mod = await import('qr-scanner')
    const QrScanner = mod.default
    const hasCamera = await QrScanner.hasCamera()
    if (!hasCamera) {
      state.value = 'error'
      errorMsg.value = t('qrscan.noCamera')
      return
    }
    scanner = new QrScanner(
      videoRef.value,
      (result: { data: string }) => handleScan(result.data),
      {
        highlightScanRegion: true,
        highlightCodeOutline: true,
        preferredCamera: 'environment',
        maxScansPerSecond: 5,
      },
    )
    await scanner.start()
    state.value = 'scanning'
  } catch (e) {
    state.value = 'error'
    errorMsg.value = e instanceof Error ? e.message : String(e)
  }
}

function handleScan(data: string) {
  const now = Date.now()
  if (now - lastHandledAt < 800) return
  lastHandledAt = now
  lastScannedUrl.value = data
  const booth = findBoothByUrl(data)
  if (booth) {
    stopScanner()
    emit('update:modelValue', false)
    const boothPath = booth.slug || booth.id
    navigateTo(`/events/${props.eventSlug}/booth/${boothPath}`)
  } else {
    noMatchUrl.value = data
  }
}

watch(() => props.modelValue, async (open) => {
  if (open) {
    await nextTick()
    await startScanner()
  } else {
    stopScanner()
  }
})

onBeforeUnmount(stopScanner)
</script>

<template>
  <UModal :model-value="modelValue" :ui="{ width: 'sm:max-w-md' }"
    @update:model-value="emit('update:modelValue', $event)">
    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <h3 class="font-semibold text-white flex items-center gap-2">
            <UIcon name="i-heroicons-qr-code" class="w-5 h-5" />
            {{ t('qrscan.title') }}
          </h3>
          <UButton icon="i-heroicons-x-mark" variant="ghost" color="gray" size="sm" @click="close" />
        </div>
      </template>

      <div class="space-y-3">
        <div class="relative rounded-lg overflow-hidden bg-black aspect-square">
          <video ref="videoRef" class="w-full h-full object-cover" playsinline muted />
          <div v-if="state !== 'scanning'"
            class="absolute inset-0 flex items-center justify-center text-gray-300 text-sm px-4 text-center">
            <span v-if="state === 'starting'">{{ t('qrscan.starting') }}</span>
            <span v-else-if="state === 'error'">{{ errorMsg ?? t('qrscan.errorTitle') }}</span>
            <span v-else>—</span>
          </div>
        </div>

        <p v-if="state === 'scanning'" class="text-xs text-gray-400 text-center">
          {{ t('qrscan.hint') }}
        </p>

        <UAlert
          v-if="noMatchUrl && state === 'scanning'"
          icon="i-heroicons-exclamation-triangle"
          color="yellow"
          variant="soft"
          :title="t('qrscan.noMatchTitle')"
          :description="noMatchUrl"
        />

        <UAlert
          v-if="state === 'error' && errorMsg"
          icon="i-heroicons-x-circle"
          color="red"
          variant="soft"
          :title="t('qrscan.errorTitle')"
          :description="errorMsg"
        />

        <div v-if="state === 'error'" class="flex gap-2 justify-end">
          <UButton size="sm" variant="ghost" color="gray" @click="close">{{ t('common.cancel') }}</UButton>
          <UButton size="sm" color="purple" @click="startScanner">{{ t('qrscan.retry') }}</UButton>
        </div>
      </div>
    </UCard>
  </UModal>
</template>
