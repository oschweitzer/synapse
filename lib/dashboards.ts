import type { SupabaseClient } from '@supabase/supabase-js'
import { WIDGET_IDS, normalizeWidgets, type Visibility, type WidgetId } from '@/lib/dashboard'

export type DashboardRow = {
  id: string
  name: string
  visibility: Visibility
  isDefault: boolean
  widgets: WidgetId[]
}

/**
 * Dashboards de l'utilisateur, le dashboard par défaut en tête, avec leurs widgets dans l'ordre.
 * Une liste vide (premier accès) déclenche la création du dashboard par défaut
 * (`ensure_default_dashboard`) puis une seconde lecture ; sinon aucune écriture. Lève si une
 * lecture ou la création échoue.
 */
export async function listDashboards(supabase: SupabaseClient): Promise<DashboardRow[]> {
  const db = supabase.schema('synapse')

  // Next mémoïse les GET identiques d'un même rendu : sans signal propre, la relecture après la
  // création rendrait la liste vide d'avant. Un `AbortSignal` sort la requête de la mémoïsation.
  const read = async () => {
    const signal = new AbortController().signal
    const [dashboards, widgets] = await Promise.all([
      db.from('dashboards').select('id, name, visibility, is_default, position, created_at').order('position').order('created_at').abortSignal(signal),
      db.from('dashboard_widgets').select('dashboard_id, widget_id, position').order('position').abortSignal(signal),
    ])
    if (dashboards.error) throw dashboards.error
    if (widgets.error) throw widgets.error
    return { dashboards: dashboards.data, widgets: widgets.data }
  }

  let rows = await read()
  if (rows.dashboards.length === 0) {
    const ensured = await db.rpc('ensure_default_dashboard', { p_widgets: [...WIDGET_IDS] })
    if (ensured.error) throw ensured.error
    rows = await read()
  }
  const { dashboards, widgets } = rows

  const byDashboard = new Map<string, string[]>()
  for (const w of widgets) byDashboard.set(w.dashboard_id, [...(byDashboard.get(w.dashboard_id) ?? []), w.widget_id])

  return dashboards
    .map((d) => ({
      id: d.id,
      name: d.name,
      visibility: (d.visibility === 'public' ? 'public' : 'private') as Visibility,
      isDefault: d.is_default,
      widgets: normalizeWidgets(byDashboard.get(d.id)),
    }))
    .sort((a, b) => Number(b.isDefault) - Number(a.isDefault))
}
