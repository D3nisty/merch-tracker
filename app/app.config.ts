// Nuxt UI theme — align the component library to the Nomad system (sky accent
// on slate). Beyond the primary/gray aliases, we override the shared shells
// (card, modal, inputs, buttons, badges) so every UCard/UModal/UInput/UButton
// reads as Nomad — this is what restyles the modals and admin surfaces without
// hand-editing each. Person-colour dots use raw `bg-<color>-500` classes and
// are unaffected.
export default defineAppConfig({
  ui: {
    primary: 'sky',
    gray: 'slate',

    card: {
      background: 'bg-surface',
      divide: 'divide-y divide-line-soft',
      ring: 'ring-1 ring-line',
      rounded: 'rounded-window',
      shadow: '',
      header: { padding: 'px-5 py-4 sm:px-5' },
      body: { padding: 'px-5 py-4 sm:p-5' },
      footer: { padding: 'px-5 py-4 sm:px-5' },
    },

    modal: {
      overlay: { background: 'bg-app/70 backdrop-blur-sm' },
      background: 'bg-surface',
      ring: 'ring-1 ring-line',
      rounded: 'rounded-window',
      shadow: 'shadow-elevated',
      width: 'w-full sm:max-w-md',
    },

    button: {
      font: 'font-semibold',
      rounded: 'rounded-field',
      default: { size: 'md' },
    },

    input: {
      background: 'bg-surface-2',
      rounded: 'rounded-field',
      color: {
        white: {
          outline: 'bg-surface-2 text-ink ring-1 ring-inset ring-line focus:ring-2 focus:ring-line-focus placeholder:text-faint',
        },
      },
    },
    select: {
      background: 'bg-surface-2',
      rounded: 'rounded-field',
      color: {
        white: {
          outline: 'bg-surface-2 text-ink ring-1 ring-inset ring-line focus:ring-2 focus:ring-line-focus',
        },
      },
    },
    textarea: {
      background: 'bg-surface-2',
      rounded: 'rounded-field',
      color: {
        white: {
          outline: 'bg-surface-2 text-ink ring-1 ring-inset ring-line focus:ring-2 focus:ring-line-focus placeholder:text-faint',
        },
      },
    },
    selectMenu: {
      background: 'bg-surface',
      ring: 'ring-1 ring-line',
      rounded: 'rounded-card',
      option: { active: 'bg-surface-2' },
    },

    formGroup: {
      label: { base: 'text-xs font-semibold text-muted' },
    },

    badge: {
      rounded: 'rounded-md',
      font: 'font-semibold',
    },

    checkbox: {
      rounded: 'rounded-md',
    },

    table: {
      divide: 'divide-y divide-line-hair',
      th: { color: 'text-faint', font: 'font-bold', padding: 'px-4 py-3' },
      td: { color: 'text-ink', padding: 'px-4 py-3' },
      tr: { base: '' },
    },
  },
})
