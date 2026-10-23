'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

/**
 * Retire l'accès de Synapse : jeton chiffré, état de connexion et cache.
 * L'autorisation reste visible chez Google (myaccount.google.com/permissions)
 * tant qu'elle n'y est pas retirée ; sans jeton, Synapse ne peut plus rien lire.
 */
export async function disconnectGoogle() {
  const supabase = await createClient()
  const { error } = await supabase.schema('synapse').rpc('disconnect_google')
  if (error) {
    console.error('[google] déconnexion', error)
    redirect('/settings?google=error')
  }
  revalidatePath('/')
  redirect('/settings?google=disconnected')
}

/** Lance une synchro immédiate pour l'utilisateur connecté (l'Edge Function vérifie la session). */
export async function syncGoogleNow() {
  const supabase = await createClient()
  const { error } = await supabase.functions.invoke('synapse-google-sync', { method: 'POST' })
  if (error) {
    console.error('[google] synchro manuelle', error)
    redirect('/settings?google=sync-error')
  }
  revalidatePath('/')
  redirect('/settings?google=synced')
}
