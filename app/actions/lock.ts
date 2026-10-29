'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { hashCode, validateNewCode } from '@/lib/lock/code'
import { IDLE_CHOICES, readLockConfig } from '@/lib/lock/config'
import { attemptCode } from '@/lib/lock/server'
import { clearUnlockCookie, issueUnlockCookie } from '@/lib/lock/token'
import { sectionState, type SectionState } from '@/lib/settings/section-state'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function setUnlockCookie(userId: string, epoch: number, idleMinutes: number) {
  const { name, value, options } = await issueUnlockCookie(userId, epoch, idleMinutes)
  ;(await cookies()).set(name, value, options)
}

/**
 * Vérifie le code actuel (avec temporisation) : renvoie le code d'échec, `null` si le code est juste.
 * Redirige vers /login quand la session est fermée.
 */
async function requireCurrentCode(supabase: Awaited<ReturnType<typeof createClient>>, current: string): Promise<string | null> {
  const result = await attemptCode(supabase, current)
  if (result.ok) return null
  if (result.reason === 'signed-out') redirect('/login')
  return result.reason === 'throttled' ? `throttled-${result.retryAfter ?? 60}` : 'current'
}

/**
 * Définit le code (premier réglage) ou le change (code actuel exigé).
 * Action de `useActionState` : renvoie le code du message à afficher dans la section.
 */
export async function saveLockCode(_prev: SectionState, formData: FormData): Promise<SectionState> {
  const code = String(formData.get('code') ?? '')
  const confirm = String(formData.get('confirm') ?? '')
  const current = String(formData.get('current') ?? '')

  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) redirect('/login')

  if (validateNewCode(code)) return sectionState('short')
  if (code !== confirm) return sectionState('mismatch')

  // Le message suit la config lue côté serveur, pas le champ « current » envoyé par le client.
  let changed = false
  try {
    const existing = await readLockConfig(supabase)
    changed = existing !== null
    if (existing) {
      const failure = await requireCurrentCode(supabase, current)
      if (failure) return sectionState(failure)
    }
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
    return sectionState('save')
  }
  revalidatePath('/settings')
  return sectionState(changed ? 'changed' : 'enabled')
}

/**
 * Change le délai d'inactivité avant verrouillage.
 * Action de `useActionState` : renvoie le code du message à afficher dans la section.
 */
export async function saveLockIdle(_prev: SectionState, formData: FormData): Promise<SectionState> {
  const minutes = Number(formData.get('idle_minutes'))
  if (!IDLE_CHOICES.some((c) => c.minutes === minutes)) return sectionState('save')

  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) redirect('/login')

  try {
    const config = await readLockConfig(supabase)
    if (!config) return sectionState('save')
    const { error } = await supabase.schema('synapse').from('lock').update({ idle_minutes: minutes }).eq('user_id', auth.user.id)
    if (error) throw error
    await setUnlockCookie(auth.user.id, config.epoch, minutes)
  } catch (e) {
    if (e instanceof Error && 'digest' in e) throw e
    console.error('[lock] délai de verrouillage', e)
    return sectionState('save')
  }
  revalidatePath('/settings')
  return sectionState('idle')
}

/**
 * Désactive le verrouillage : code actuel exigé, empreintes supprimées.
 * Action de `useActionState` : renvoie le code du message à afficher dans la section.
 */
export async function disableLock(_prev: SectionState, formData: FormData): Promise<SectionState> {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) redirect('/login')

  try {
    const failure = await requireCurrentCode(supabase, String(formData.get('current') ?? ''))
    if (failure) return sectionState(failure)
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
    return sectionState('save')
  }
  revalidatePath('/settings')
  return sectionState('disabled')
}

/**
 * Retire une empreinte enregistrée.
 * Action de `useActionState` : renvoie le code du message à afficher dans la section.
 */
export async function removePasskey(_prev: SectionState, formData: FormData): Promise<SectionState> {
  const id = String(formData.get('id') ?? '')
  if (!UUID.test(id)) return sectionState('save')

  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) redirect('/login')

  // Filtre aussi sur l'utilisateur (en plus de la RLS) et exige qu'une ligne ait été supprimée.
  const { data, error } = await supabase.schema('synapse').from('lock_passkeys').delete().eq('id', id).eq('user_id', auth.user.id).select('id')
  if (error) {
    console.error('[lock] suppression de la passkey', error)
    return sectionState('save')
  }
  if (!data || data.length === 0) return sectionState('save')
  revalidatePath('/settings')
  return sectionState('revoked')
}
