import { defineConfig, devices } from '@playwright/test'
import { assertLocalTarget } from './e2e/guard'

// L'environnement du shell l'emporte sur e2e/.env.test (loadEnvFile n'écrase rien).
try {
  process.loadEnvFile('e2e/.env.test')
} catch {
  // Pas de fichier : les variables viennent de l'environnement (CI).
}

// Refus immédiat si la base ou Supabase ne sont pas locaux.
assertLocalTarget(process.env)

const baseURL = process.env.E2E_BASE_URL || 'http://localhost:3000'

export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.spec.ts',
  // Les specs partagent une seule base : un seul worker, dans l'ordre.
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  forbidOnly: !!process.env.CI,
  reporter: [['list'], ['html', { open: 'never' }]],
  outputDir: 'test-results',
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      // API externes simulées (Google, Open-Meteo, TheMealDB).
      command: 'node e2e/mock-server.ts',
      url: 'http://127.0.0.1:4010/health',
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
    {
      // Build de production, comme sur Vercel : les NEXT_PUBLIC_* sont figées au build.
      command: 'npm run build && npm run start -- --port 3000',
      url: 'http://localhost:3000/login',
      reuseExistingServer: !process.env.CI,
      timeout: 300_000,
    },
  ],
})
