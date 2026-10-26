'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { WIDGET_IDS, resolveWidgetOrder, type WidgetId } from '@/lib/dashboard'
import { invalidateCash } from '@/lib/connectors/cash'

/** Enregistre l'ordre des widgets de l'utilisateur (`synapse.settings.widget_order`). */
export async function saveWidgetOrder(order: string[]): Promise<{ error?: string }> {
  if (!Array.isArray(order) || order.some((id) => typeof id !== 'string')) return { error: 'Ordre invalide.' }

  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return { error: 'Session expirée.' }

  // Upsert limité à cette colonne : les autres réglages restent intacts.
  const { error } = await supabase
    .schema('synapse')
    .from('settings')
    .upsert({ user_id: auth.user.id, widget_order: resolveWidgetOrder(order) }, { onConflict: 'user_id' })
  if (error) {
    console.error('[dashboard] enregistrement de l’ordre des widgets', error)
    return { error: 'Impossible d’enregistrer l’ordre.' }
  }
  return {}
}

/** Revient à l'ordre par défaut (liste vide = ordre par défaut). */
export async function resetWidgetOrder() {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) redirect('/login')

  const { error } = await supabase
    .schema('synapse')
    .from('settings')
    .upsert({ user_id: auth.user.id, widget_order: [] }, { onConflict: 'user_id' })
  if (error) {
    console.error('[dashboard] réinitialisation de l’ordre des widgets', error)
    redirect('/settings?error=save')
  }

  revalidatePath('/')
  redirect('/settings?order=reset')
}

/**
 * Rafraîchit un seul widget. Mails et agenda relancent la synchro Google (l'Edge Function
 * vérifie la session) ; les dépenses vident leur cache ; les autres sont relus depuis leur source.
 * Garmin est alimenté par un job externe : seule la lecture est rafraîchie.
 */
export async function refreshWidget(id: WidgetId): Promise<{ error?: string }> {
  if (!WIDGET_IDS.includes(id)) return { error: 'Widget inconnu.' }

  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return { error: 'Session expirée.' }

  if (id === 'mail' || id === 'agenda') {
    const { error } = await supabase.functions.invoke('synapse-google-sync', { method: 'POST' })
    if (error) {
      console.error(`[dashboard] synchro Google (${id})`, error)
      return { error: 'Synchro Google impossible.' }
    }
  }
  if (id === 'cash') invalidateCash(auth.user.id)

  revalidatePath('/')
  return {}
}
