'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { WIDGET_IDS, normalizeWidgets, type WidgetId } from '@/lib/dashboard'
import { invalidateCash } from '@/lib/connectors/cash'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Enregistre l'ordre des widgets d'un dashboard de l'utilisateur. Ne change pas l'ensemble
 * des widgets (réservé à l'admin) : ids absents du dashboard ignorés, ceux omis restent en fin.
 */
export async function saveWidgetOrder(dashboardId: string, order: string[]): Promise<{ error?: string }> {
  if (typeof dashboardId !== 'string' || !UUID.test(dashboardId)) return { error: 'Dashboard invalide.' }
  if (!Array.isArray(order) || order.some((id) => typeof id !== 'string')) return { error: 'Ordre invalide.' }

  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return { error: 'Session expirée.' }

  const db = supabase.schema('synapse')
  const { data: current, error: readError } = await db
    .from('dashboard_widgets')
    .select('widget_id')
    .eq('dashboard_id', dashboardId)
    .order('position')
  if (readError || current.length === 0) {
    if (readError) console.error('[dashboard] lecture des widgets', readError)
    return { error: 'Impossible d’enregistrer l’ordre.' }
  }
  const present = normalizeWidgets(current.map((w) => w.widget_id))
  const requested = normalizeWidgets(order).filter((id) => present.includes(id))
  const widgets = [...requested, ...present.filter((id) => !requested.includes(id))]

  const { error } = await db.rpc('set_dashboard_widgets', { p_dashboard: dashboardId, p_widgets: widgets })
  if (error) {
    console.error('[dashboard] enregistrement de l’ordre des widgets', error)
    return { error: 'Impossible d’enregistrer l’ordre.' }
  }
  return {}
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
