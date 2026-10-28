/** Accesseurs typés de l'environnement e2e (chargé depuis e2e/.env.test par playwright.config.ts). */

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Variable d'environnement e2e manquante : ${name} (voir e2e/.env.test.example).`)
  return value
}

export const supabaseUrl = () => required('NEXT_PUBLIC_SUPABASE_URL')
export const anonKey = () => required('NEXT_PUBLIC_SUPABASE_ANON_KEY')
export const serviceRoleKey = () => required('SUPABASE_SERVICE_ROLE_KEY')
export const databaseUrl = () => required('DATABASE_URL')
export const baseURL = () => process.env.E2E_BASE_URL || 'http://localhost:3000'

export const TEST_USERS = {
  allowed: { email: process.env.E2E_ALLOWED_EMAIL || 'e2e-allowed@example.test' },
  denied: { email: process.env.E2E_DENIED_EMAIL || 'e2e-denied@example.test' },
}

export const TEST_PASSWORD = process.env.E2E_PASSWORD || 'e2e-password-123'

/** Sessions enregistrées par la réinitialisation, réutilisées par les specs via `storageState`. */
export const STORAGE_STATE = {
  allowed: 'e2e/.auth/allowed.json',
  denied: 'e2e/.auth/denied.json',
}
