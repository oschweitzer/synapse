import type { User } from '@supabase/supabase-js'

/**
 * Liste blanche : le projet Supabase est partagé avec Cairn, n'importe quel compte Google
 * pourrait sinon s'y connecter. Sans `ALLOWED_EMAILS`, personne n'est autorisé.
 */
export function isAllowedUser(user: Pick<User, 'email' | 'email_confirmed_at'>): boolean {
  const allowed = (process.env.ALLOWED_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
  return !!user.email && !!user.email_confirmed_at && allowed.includes(user.email.toLowerCase())
}
