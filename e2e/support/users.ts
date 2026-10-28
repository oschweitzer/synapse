import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { STORAGE_STATE, TEST_PASSWORD, TEST_USERS, anonKey, baseURL, serviceRoleKey, supabaseUrl } from './env'
import { assertLocalTarget } from '../guard'

type Key = keyof typeof TEST_USERS

function admin() {
  return createClient(supabaseUrl(), serviceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/** Supprime les utilisateurs de test s'ils existent (comparaison d'email insensible à la casse). */
export async function deleteTestUsers() {
  assertLocalTarget(process.env)
  const { auth } = admin()
  const { data, error } = await auth.admin.listUsers({ perPage: 1000 })
  if (error) throw error
  const emails = Object.values(TEST_USERS).map((u) => u.email.toLowerCase())
  for (const user of data.users) {
    if (!user.email || !emails.includes(user.email.toLowerCase())) continue
    const { error: deleteError } = await auth.admin.deleteUser(user.id)
    if (deleteError) throw deleteError
  }
}

/** Recrée les utilisateurs de test (administrateur, membre, refusé), tous avec un email confirmé. */
export async function recreateTestUsers() {
  assertLocalTarget(process.env)
  await deleteTestUsers()
  const { auth } = admin()
  for (const { email } of Object.values(TEST_USERS)) {
    const { error } = await auth.admin.createUser({ email, password: TEST_PASSWORD, email_confirm: true })
    if (error) throw error
  }
}

/** Identifiant (uuid) d'un utilisateur de test, pour insérer des lignes qui lui appartiennent. */
export async function testUserId(key: Key): Promise<string> {
  assertLocalTarget(process.env)
  const { data, error } = await admin().auth.admin.listUsers({ perPage: 1000 })
  if (error) throw error
  const email = TEST_USERS[key].email.toLowerCase()
  const user = data.users.find((u) => u.email?.toLowerCase() === email)
  if (!user) throw new Error(`Utilisateur de test introuvable : ${email} (resetDatabase a-t-il été appelé ?).`)
  return user.id
}

type Cookie = { name: string; value: string }

/**
 * Ouvre une session par mot de passe avec @supabase/ssr (même encodage et même
 * découpage en morceaux que l'application) et écrit les cookies au format
 * `storageState` de Playwright.
 */
export async function writeStorageState(key: Key) {
  assertLocalTarget(process.env)
  const jar: Cookie[] = []
  const supabase = createServerClient(supabaseUrl(), anonKey(), {
    cookies: {
      getAll: () => jar,
      setAll: (cookies) => {
        for (const { name, value } of cookies) {
          const index = jar.findIndex((c) => c.name === name)
          if (index >= 0) jar.splice(index, 1)
          jar.push({ name, value })
        }
      },
    },
  })

  const { error } = await supabase.auth.signInWithPassword({ email: TEST_USERS[key].email, password: TEST_PASSWORD })
  if (error) throw error

  const domain = new URL(baseURL()).hostname
  const cookies = jar
    // Une valeur vide est une suppression de cookie, pas une session.
    .filter((c) => c.value !== '')
    .map((c) => ({
      name: c.name,
      value: c.value,
      domain,
      path: '/',
      expires: Math.floor(Date.now() / 1000) + 3600,
      httpOnly: false,
      secure: false,
      sameSite: 'Lax' as const,
    }))

  const file = STORAGE_STATE[key]
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify({ cookies, origins: [] }, null, 2))
}
