'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { sectionState, type SectionState } from '@/lib/settings/section-state'

/**
 * Retire l'accès de Synapse : jeton chiffré, état de connexion et cache.
 * L'autorisation reste visible chez Google (myaccount.google.com/permissions)
 * tant qu'elle n'y est pas retirée ; sans jeton, Synapse ne peut plus rien lire.
 * Action de `useActionState` : renvoie le code du message à afficher dans la section.
 */
export async function disconnectGoogle(_prev: SectionState, _formData: FormData): Promise<SectionState> {
  const supabase = await createClient()
  const { error } = await supabase.schema('synapse').rpc('disconnect_google')
  if (error) {
    console.error('[google] déconnexion', error)
    return sectionState('disconnect-error')
  }
  revalidatePath('/')
  revalidatePath('/settings')
  return sectionState('disconnected')
}

/**
 * Lance une synchro immédiate pour l'utilisateur connecté (l'Edge Function vérifie la session).
 * Action de `useActionState` : renvoie le code du message à afficher dans la section.
 */
export async function syncGoogleNow(_prev: SectionState, _formData: FormData): Promise<SectionState> {
  const supabase = await createClient()
  const { error } = await supabase.functions.invoke('synapse-google-sync', { method: 'POST' })
  if (error) {
    console.error('[google] synchro manuelle', error)
    return sectionState('sync-error')
  }
  revalidatePath('/')
  revalidatePath('/settings')
  return sectionState('synced')
}
