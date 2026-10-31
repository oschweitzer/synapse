import { cookies } from 'next/headers'
import type { SupabaseClient } from '@supabase/supabase-js'
import { readLockConfig, type LockState } from '@/lib/lock/config'
import { UNLOCK_COOKIE, isUnlocked } from '@/lib/lock/token'

/**
 * État du verrouillage pour une page rendue sous le middleware : le middleware laisse passer
 * la page d'accueil verrouillée (un dashboard public s'affiche sans second facteur), la page
 * doit donc vérifier elle-même le cookie avant de servir un dashboard privé.
 * Sans verrouillage activé, `unlocked` est vrai. Lève si la lecture échoue : l'appelant ferme l'accès.
 */
export async function readLockState(supabase: SupabaseClient, userId: string): Promise<LockState> {
  const config = await readLockConfig(supabase)
  if (!config) return { config: null, unlocked: true }
  const token = (await cookies()).get(UNLOCK_COOKIE)?.value
  return { config, unlocked: await isUnlocked(token, userId, config.epoch) }
}
