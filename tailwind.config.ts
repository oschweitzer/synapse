import type { Config } from 'tailwindcss'

// Les couleurs pointent sur les variables de app/tokens.css (design system Synapse).
// Les palettes `slate`, `red`, `green`, `amber` et `sky` sont aliasées sur les tokens :
// les classes `dark:*` existantes (l'appli est sombre uniquement) prennent la teinte HUD
// sans réécrire chaque écran. Pour un nouvel écran, préférer les tokens (`ink`, `hull`, `cyan`…).
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        void: { 900: 'var(--void-900)' },
        hull: { 800: 'var(--hull-800)', 700: 'var(--hull-700)', 600: 'var(--hull-600)' },
        line: { 500: 'var(--line-500)', 300: 'var(--line-300)' },
        ink: { 100: 'var(--ink-100)', 300: 'var(--ink-300)', 500: 'var(--ink-500)' },
        cyan: { 300: 'var(--cyan-300)', 400: 'var(--cyan-400)', 600: 'var(--cyan-600)', wash: 'var(--cyan-wash)' },
        amber: {
          50: 'var(--amber-wash)',
          200: 'var(--amber-400)',
          300: 'var(--amber-400)',
          400: 'var(--amber-400)',
          700: 'var(--amber-400)',
          900: 'var(--amber-400)',
          950: 'var(--on-accent)',
          wash: 'var(--amber-wash)',
        },
        ok: 'var(--signal-ok)',
        danger: 'var(--signal-danger)',
        'on-accent': 'var(--on-accent)',
        scrim: 'var(--scrim)',
        slate: {
          50: 'var(--hull-700)',
          100: 'var(--ink-100)',
          200: 'var(--line-500)',
          300: 'var(--line-300)',
          400: 'var(--ink-300)',
          500: 'var(--ink-500)',
          600: 'var(--ink-500)',
          700: 'var(--line-300)',
          800: 'var(--line-500)',
          900: 'var(--hull-800)',
          950: 'var(--void-900)',
        },
        red: { 100: 'var(--danger-wash)', 300: 'var(--signal-danger)', 400: 'var(--signal-danger)', 600: 'var(--signal-danger)', 700: 'var(--signal-danger)', 800: 'var(--signal-danger)', 900: 'var(--signal-danger)' },
        green: { 400: 'var(--signal-ok)', 700: 'var(--signal-ok)' },
        emerald: { 500: 'var(--signal-ok)' },
        sky: { 300: 'var(--cyan-300)', 400: 'var(--cyan-400)', 600: 'var(--cyan-400)', 700: 'var(--cyan-300)' },
      },
      fontFamily: { display: 'var(--font-display)', sans: 'var(--font-sans)', mono: 'var(--font-mono)' },
      boxShadow: { depth: 'var(--panel-depth)' },
    },
  },
  plugins: [],
}

export default config
