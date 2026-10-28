import coreWebVitals from 'eslint-config-next/core-web-vitals'
import typescript from 'eslint-config-next/typescript'

const config = [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'coverage/**',
      'next-env.d.ts',
      'playwright-report/**',
      'test-results/**',
      'blob-report/**',
      'e2e/.auth/**',
    ],
  },
  ...coreWebVitals,
  ...typescript,
  {
    // Règles ajoutées par eslint-config-next 16 : le code existant les enfreint,
    // on les garde en avertissement le temps de le reprendre.
    rules: {
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/error-boundaries': 'warn',
    },
  },
]

export default config
