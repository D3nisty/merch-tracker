import type { Config } from 'tailwindcss'

/**
 * Nomad design system tokens.
 *
 * Colours map to CSS variables declared in `app/assets/css/nomad.css` so the
 * dark (primary) and light themes can flip the neutral surfaces/text/borders
 * from ONE place. Accent + semantic colours (sky, indigo, planned, bought,
 * must) are constant across themes — they read fine on both per the handoff.
 *
 * Utility name → token:
 *   bg-app / bg-sidebar / bg-surface / bg-surface-2   surfaces
 *   border-line / border-line-soft / border-line-hair / border-line-focus
 *   text-ink / text-ink-strong / text-muted / text-faint / text-faint-2
 *   sky / sky-soft / indigo / conv / conv-soft        accents
 *   planned / bought / must + their chip-* backgrounds semantics
 */
export default <Partial<Config>>{
  theme: {
    extend: {
      fontFamily: {
        // Display / headings
        display: ['Sora', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        // Body / UI (default)
        sans: ['Public Sans', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        // Numeric / money
        mono: ['IBM Plex Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      colors: {
        // ── Surfaces & lines (theme-aware via CSS vars) ──
        app: 'var(--c-app)',
        sidebar: 'var(--c-sidebar)',
        surface: 'var(--c-surface)',
        'surface-2': 'var(--c-surface-2)',
        line: {
          DEFAULT: 'var(--c-border)',
          soft: 'var(--c-border-soft)',
          hair: 'var(--c-border-hair)',
          focus: 'var(--c-border-focus)',
        },
        // ── Text (theme-aware) ──
        ink: {
          DEFAULT: 'var(--c-text)',
          strong: 'var(--c-text-strong)',
        },
        muted: 'var(--c-muted)',
        faint: {
          DEFAULT: 'var(--c-faint)',
          2: 'var(--c-faint-2)',
        },
        // ── Accents & semantics (constant) ──
        sky: { DEFAULT: '#38bdf8', soft: '#7dd3fc' },
        indigo: '#6366f1',
        conv: { DEFAULT: '#818cf8', soft: '#a5b4fc' },
        planned: '#f5b544',
        bought: '#2dd4a7',
        must: '#f87171',
        'on-accent': '#04121c',
        // ── Chip backgrounds ──
        chip: {
          sky: '#12283a',
          conv: '#1c1b3a',
          planned: '#2a2210',
          bought: '#0e2a24',
          must: '#2a1518',
        },
      },
      borderRadius: {
        field: '10px',
        card: '14px',
        window: '18px',
      },
      boxShadow: {
        // Elevated cards / modals
        elevated: '0 30px 80px -30px rgba(0,0,0,0.85)',
        // Floating menus / popovers
        pop: '0 20px 50px -20px rgba(0,0,0,0.9)',
      },
    },
  },
}
