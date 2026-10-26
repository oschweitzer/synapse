'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { resolveWidgetOrder } from '@/lib/dashboard'

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
