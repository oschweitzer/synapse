import type { User } from '@supabase/supabase-js'
import { isAllowedUser } from '@/lib/auth'

/**
 * Administrateur : sous-ensemble de `ADMIN_EMAILS` s'il est défini ; sinon tout compte autorisé
 * (`ALLOWED_EMAILS`), l'application étant mono-utilisateur. À vérifier côté serveur à chaque action.
 */
export function isAdminUser(user: Pick<User, 'email' | 'email_confirmed_at'>): boolean {
  if (!isAllowedUser(user)) return false
  const admins = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
  return admins.length === 0 || admins.includes(user.email!.toLowerCase())
}
