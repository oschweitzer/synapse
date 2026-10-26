// Lecture de la configuration du verrouillage. Sans module Node : utilisé par le middleware (Edge).
import type { SupabaseClient } from '@supabase/supabase-js'

export const IDLE_CHOICES = [
  { minutes: 1, label: '1 minute' },
  { minutes: 5, label: '5 minutes' },
  { minutes: 15, label: '15 minutes' },
  { minutes: 0, label: 'À la fermeture du navigateur' },
] as const

export type LockConfig = { idleMinutes: number; epoch: number }

/** `null` = verrouillage non activé. Lève si la lecture échoue : l'appelant doit rester verrouillé. */
export async function readLockConfig(supabase: SupabaseClient): Promise<LockConfig | null> {
  const { data, error } = await supabase.schema('synapse').from('lock').select('idle_minutes, epoch').maybeSingle()
  if (error) throw error
  return data ? { idleMinutes: data.idle_minutes as number, epoch: data.epoch as number } : null
}
