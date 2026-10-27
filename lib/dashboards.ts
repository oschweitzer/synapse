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
 * Dashboards de l'utilisateur (le premier accès crée le dashboard par défaut), le dashboard par
 * défaut en tête, avec leurs widgets dans l'ordre. Lève si la lecture échoue.
 */
export async function listDashboards(supabase: SupabaseClient): Promise<DashboardRow[]> {
  const db = supabase.schema('synapse')
  const ensured = await db.rpc('ensure_default_dashboard', { p_widgets: [...WIDGET_IDS] })
  if (ensured.error) throw ensured.error

  const [dashboards, widgets] = await Promise.all([
    db.from('dashboards').select('id, name, visibility, is_default, position, created_at').order('position').order('created_at'),
    db.from('dashboard_widgets').select('dashboard_id, widget_id, position').order('position'),
  ])
  if (dashboards.error) throw dashboards.error
  if (widgets.error) throw widgets.error

  const byDashboard = new Map<string, string[]>()
  for (const w of widgets.data) byDashboard.set(w.dashboard_id, [...(byDashboard.get(w.dashboard_id) ?? []), w.widget_id])

  return dashboards.data
    .map((d) => ({
      id: d.id,
      name: d.name,
      visibility: (d.visibility === 'public' ? 'public' : 'private') as Visibility,
      isDefault: d.is_default,
      widgets: normalizeWidgets(byDashboard.get(d.id)),
    }))
    .sort((a, b) => Number(b.isDefault) - Number(a.isDefault))
}
