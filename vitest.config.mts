import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    // Même alias que `paths` de tsconfig.json : `@/lib/...` pointe vers la racine du dépôt.
    alias: { '@': fileURLToPath(new URL('.', import.meta.url)) },
  },
  test: {
    // Par défaut node ; les tests de composants passent en jsdom avec `// @vitest-environment jsdom` en première ligne.
    environment: 'node',
    setupFiles: ['./test/setup-dom.ts'],
    include: ['**/*.test.ts', '**/*.test.tsx'],
    exclude: ['e2e/**', 'node_modules/**', '.next/**', 'supabase/**'],
    // Chaque test repart d'un environnement propre : variables, globales et mocks sont restaurés.
    unstubEnvs: true,
    unstubGlobals: true,
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      include: ['lib/**/*.ts', 'app/actions/**/*.ts', 'app/api/**/*.ts', 'components/**/*.{ts,tsx}'],
      exclude: ['**/*.test.ts', '**/*.test.tsx', 'lib/types/**'],
      reporter: ['text', 'html'],
      reportsDirectory: 'coverage',
    },
  },
})
