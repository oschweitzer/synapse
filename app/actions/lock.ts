'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { hashCode, validateNewCode } from '@/lib/lock/code'
import { IDLE_CHOICES, readLockConfig } from '@/lib/lock/config'
import { attemptCode } from '@/lib/lock/server'
import { clearUnlockCookie, issueUnlockCookie } from '@/lib/lock/token'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Retour sur les réglages avec un message (`?lock=…`). */
function back(code: string): never {
  redirect(`/settings?lock=${code}`)
}

async function setUnlockCookie(userId: string, epoch: number, idleMinutes: number) {
  const { name, value, options } = await issueUnlockCookie(userId, epoch, idleMinutes)
  ;(await cookies()).set(name, value, options)
}

/** Vérifie le code actuel (avec temporisation) ; redirige avec le motif d'échec sinon. */
async function requireCurrentCode(supabase: Awaited<ReturnType<typeof createClient>>, current: string) {
  const result = await attemptCode(supabase, current)
  if (result.ok) return result.config
  if (result.reason === 'signed-out') redirect('/login')
  back(result.reason === 'throttled' ? `throttled-${result.retryAfter ?? 60}` : 'current')
}

/** Définit le code (premier réglage) ou le change (code actuel exigé). */
export async function saveLockCode(formData: FormData) {
  const code = String(formData.get('code') ?? '')
  const confirm = String(formData.get('confirm') ?? '')
  const current = String(formData.get('current') ?? '')

  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) redirect('/login')

  if (validateNewCode(code)) back('short')
  if (code !== confirm) back('mismatch')

  try {
    const existing = await readLockConfig(supabase)
    if (existing) await requireCurrentCode(supabase, current)
    const { hash, salt } = await hashCode(code)
    const db = supabase.schema('synapse')
    const idleMinutes = existing?.idleMinutes ?? 5
    // Nouvelle epoch à chaque changement : les autres appareils déverrouillés sont reverrouillés.
    const epoch = (existing?.epoch ?? 0) + 1
    const { error } = await db
      .from('lock')
      .upsert(
        { user_id: auth.user.id, code_hash: hash, code_salt: salt, idle_minutes: idleMinutes, epoch, failed_attempts: 0, locked_until: null },
        { onConflict: 'user_id' },
      )
    if (error) throw error
    await setUnlockCookie(auth.user.id, epoch, idleMinutes)
  } catch (e) {
    if (e instanceof Error && 'digest' in e) throw e
    console.error('[lock] enregistrement du code', e)
    back('save')
  }
  back(current ? 'changed' : 'enabled')
}

export async function saveLockIdle(formData: FormData) {
  const minutes = Number(formData.get('idle_minutes'))
  if (!IDLE_CHOICES.some((c) => c.minutes === minutes)) back('save')

  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) redirect('/login')

  try {
    const config = await readLockConfig(supabase)
    if (!config) back('save')
    const { error } = await supabase.schema('synapse').from('lock').update({ idle_minutes: minutes }).eq('user_id', auth.user.id)
    if (error) throw error
    await setUnlockCookie(auth.user.id, config!.epoch, minutes)
  } catch (e) {
    if (e instanceof Error && 'digest' in e) throw e
    console.error('[lock] délai de verrouillage', e)
    back('save')
  }
  back('idle')
}

/** Désactive le verrouillage : code actuel exigé, empreintes supprimées. */
export async function disableLock(formData: FormData) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) redirect('/login')

  try {
    await requireCurrentCode(supabase, String(formData.get('current') ?? ''))
    const db = supabase.schema('synapse')
    const passkeys = await db.from('lock_passkeys').delete().eq('user_id', auth.user.id)
    if (passkeys.error) throw passkeys.error
    const lock = await db.from('lock').delete().eq('user_id', auth.user.id)
    if (lock.error) throw lock.error
    const { name, value, options } = clearUnlockCookie()
    ;(await cookies()).set(name, value, options)
  } catch (e) {
    if (e instanceof Error && 'digest' in e) throw e
    console.error('[lock] désactivation', e)
    back('save')
  }
  back('disabled')
}

export async function removePasskey(formData: FormData) {
  const id = String(formData.get('id') ?? '')
  if (!UUID.test(id)) back('save')

  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) redirect('/login')

  const { error } = await supabase.schema('synapse').from('lock_passkeys').delete().eq('id', id)
  if (error) {
    console.error('[lock] suppression de la passkey', error)
    back('save')
  }
  back('revoked')
}
