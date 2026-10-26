import type { SupabaseClient } from '@supabase/supabase-js'
import { checkCode } from '@/lib/lock/code'
import type { LockConfig } from '@/lib/lock/config'

/** Au-delà de ce nombre d'échecs consécutifs, la session Supabase est fermée. */
export const MAX_FAILURES = 10

export type CodeAttempt =
  | { ok: true; config: LockConfig }
  | { ok: false; reason: 'none' | 'wrong' | 'throttled' | 'signed-out'; retryAfter?: number }

/** Vérifie le code en appliquant la temporisation et le compteur d'échecs persistés. */
export async function attemptCode(supabase: SupabaseClient, code: string): Promise<CodeAttempt> {
  const db = supabase.schema('synapse')
  const { data: row, error } = await db
    .from('lock')
    .select('code_hash, code_salt, idle_minutes, epoch, locked_until')
    .maybeSingle()
  if (error) throw error
  if (!row) return { ok: false, reason: 'none' }

  const wait = row.locked_until ? Math.ceil((new Date(row.locked_until as string).getTime() - Date.now()) / 1000) : 0
  if (wait > 0) return { ok: false, reason: 'throttled', retryAfter: wait }

  if (await checkCode(code, row.code_hash as string, row.code_salt as string)) {
    const { error: resetError } = await db.from('lock').update({ failed_attempts: 0, locked_until: null }).gt('epoch', 0)
    if (resetError) console.error('[lock] remise à zéro des échecs', resetError)
    return { ok: true, config: { idleMinutes: row.idle_minutes as number, epoch: row.epoch as number } }
  }

  const { data: failure, error: failureError } = await db.rpc('register_lock_failure')
  if (failureError) throw failureError
  const state = failure?.[0]
  if (state && state.failed_attempts >= MAX_FAILURES) {
    await supabase.auth.signOut()
    return { ok: false, reason: 'signed-out' }
  }
  const retryAfter = state?.locked_until
    ? Math.max(0, Math.ceil((new Date(state.locked_until).getTime() - Date.now()) / 1000))
    : undefined
  return retryAfter ? { ok: false, reason: 'throttled', retryAfter } : { ok: false, reason: 'wrong' }
}

/** Message affiché pour un échec de `attemptCode`. */
export function attemptMessage(result: Extract<CodeAttempt, { ok: false }>): string {
  switch (result.reason) {
    case 'throttled':
      return `Trop d’essais. Réessaie dans ${formatWait(result.retryAfter ?? 0)}.`
    case 'signed-out':
      return 'Trop d’échecs : tu as été déconnecté.'
    case 'none':
      return 'Le verrouillage n’est pas activé.'
    default:
      return 'Code incorrect.'
  }
}

function formatWait(seconds: number): string {
  if (seconds < 90) return `${Math.max(1, seconds)} s`
  const minutes = Math.ceil(seconds / 60)
  return minutes < 90 ? `${minutes} min` : `${Math.ceil(minutes / 60)} h`
}
