/**
 * Garde-fou des tests e2e : ils réinitialisent la base et recréent des
 * utilisateurs, ils ne doivent donc JAMAIS viser le projet Supabase partagé.
 * Fonction pure, sans import, pour être testée par Vitest et appelée partout.
 */

export const LOCAL_HOSTS = ['localhost', '127.0.0.1']
export const GUARDED_VARS = ['NEXT_PUBLIC_SUPABASE_URL', 'DATABASE_URL']

/**
 * Lève si une variable gardée est absente, n'est pas une URL ou ne pointe pas
 * vers localhost / 127.0.0.1. Le message nomme la variable et l'hôte, jamais la
 * valeur complète (DATABASE_URL contient un mot de passe).
 */
export function assertLocalTarget(env: Record<string, string | undefined> = process.env): void {
  for (const name of GUARDED_VARS) {
    const value = env[name]
    if (!value) throw new Error(`Tests e2e refusés : ${name} est absent ou vide.`)

    let hostname: string
    try {
      hostname = new URL(value).hostname
    } catch {
      throw new Error(`Tests e2e refusés : ${name} n'est pas une URL valide.`)
    }

    if (!LOCAL_HOSTS.includes(hostname)) {
      throw new Error(
        `Tests e2e refusés : ${name} pointe vers ${hostname}, seuls ${LOCAL_HOSTS.join(' et ')} sont permis.`,
      )
    }
  }
}
