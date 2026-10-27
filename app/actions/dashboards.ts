'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { isAdminUser } from '@/lib/admin'
import {
  DASHBOARDS_MAX,
  DASHBOARD_NAME_MAX,
  WIDGET_IDS,
  isVisibility,
  normalizeWidgets,
  sensitiveWidgets,
  type Visibility,
} from '@/lib/dashboard'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Retour sur la zone admin des réglages avec un message (`?dashboards=…`). */
function back(code: string): never {
  redirect(`/settings?dashboards=${code}#dashboards`)
}

/** Session + droit d'administration, vérifiés côté serveur (le masquage de l'UI ne protège rien). */
async function requireAdmin() {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) redirect('/login')
  if (!isAdminUser(auth.user)) back('forbidden')
  return { supabase, user: auth.user }
}

function readName(formData: FormData): string | null {
  const name = String(formData.get('name') ?? '').trim()
  return name.length >= 1 && name.length <= DASHBOARD_NAME_MAX ? name : null
}

function readId(formData: FormData): string {
  const id = String(formData.get('id') ?? '')
  if (!UUID.test(id)) back('invalid')
  return id
}

function readVisibility(formData: FormData): Visibility {
  const value = formData.get('visibility')
  if (!isVisibility(value)) back('invalid')
  return value
}

/** Crée un dashboard vide (les widgets se choisissent ensuite). */
export async function createDashboard(formData: FormData) {
  const { supabase } = await requireAdmin()
  const name = readName(formData)
  if (!name) back('name')
  const visibility = readVisibility(formData)

  const db = supabase.schema('synapse')
  const { count, error: countError } = await db.from('dashboards').select('id', { count: 'exact', head: true })
  if (countError) {
    console.error('[dashboards] comptage', countError)
    back('save')
  }
  if ((count ?? 0) >= DASHBOARDS_MAX) back('max')

  const { error } = await db.from('dashboards').insert({ name, visibility, position: count ?? 0 })
  if (error) {
    console.error('[dashboards] création', error)
    back('save')
  }
  revalidatePath('/')
  back('created')
}

/** Renomme un dashboard, change sa visibilité et ses widgets (ordre existant conservé, nouveaux en fin). */
export async function saveDashboard(formData: FormData) {
  const { supabase } = await requireAdmin()
  const id = readId(formData)
  const name = readName(formData)
  if (!name) back('name')
  const visibility = readVisibility(formData)
  const chosen = new Set(normalizeWidgets(formData.getAll('widgets').map(String)))

  const db = supabase.schema('synapse')
  const { data: current, error: readError } = await db
    .from('dashboard_widgets')
    .select('widget_id')
    .eq('dashboard_id', id)
    .order('position')
  if (readError) {
    console.error('[dashboards] lecture des widgets', readError)
    back('save')
  }
  const kept = normalizeWidgets(current.map((w) => w.widget_id)).filter((w) => chosen.has(w))
  const widgets = [...kept, ...WIDGET_IDS.filter((w) => chosen.has(w) && !kept.includes(w))]

  // Un dashboard public ne sert que la session Supabase : pas de données sensibles dessus.
  if (visibility === 'public' && sensitiveWidgets(widgets).length > 0) back('sensitive')

  const { data: updated, error } = await db.from('dashboards').update({ name, visibility }).eq('id', id).select('id')
  if (error || updated.length === 0) {
    if (error) console.error('[dashboards] modification', error)
    back(error ? 'save' : 'invalid')
  }
  const { error: widgetsError } = await db.rpc('set_dashboard_widgets', { p_dashboard: id, p_widgets: widgets })
  if (widgetsError) {
    console.error('[dashboards] enregistrement des widgets', widgetsError)
    back('save')
  }
  revalidatePath('/')
  back('saved')
}

/** Remet les widgets d'un dashboard dans l'ordre par défaut du catalogue. */
export async function resetDashboardOrder(formData: FormData) {
  const { supabase } = await requireAdmin()
  const id = readId(formData)

  const db = supabase.schema('synapse')
  const { data: current, error: readError } = await db.from('dashboard_widgets').select('widget_id').eq('dashboard_id', id)
  if (readError) {
    console.error('[dashboards] lecture des widgets', readError)
    back('save')
  }
  const present = new Set(current.map((w) => w.widget_id))
  const { error } = await db.rpc('set_dashboard_widgets', {
    p_dashboard: id,
    p_widgets: WIDGET_IDS.filter((w) => present.has(w)),
  })
  if (error) {
    console.error('[dashboards] réinitialisation de l’ordre', error)
    back('save')
  }
  revalidatePath('/')
  back('order-reset')
}

/** Désigne le dashboard affiché par défaut. */
export async function setDefaultDashboard(formData: FormData) {
  const { supabase } = await requireAdmin()
  const id = readId(formData)

  const { error } = await supabase.schema('synapse').rpc('set_default_dashboard', { p_dashboard: id })
  if (error) {
    console.error('[dashboards] dashboard par défaut', error)
    back('save')
  }
  revalidatePath('/')
  back('default')
}

/** Supprime un dashboard ; le dashboard par défaut ne peut pas l'être. */
export async function deleteDashboard(formData: FormData) {
  const { supabase } = await requireAdmin()
  const id = readId(formData)

  const db = supabase.schema('synapse')
  const { data: target, error: readError } = await db.from('dashboards').select('is_default').eq('id', id).maybeSingle()
  if (readError) {
    console.error('[dashboards] lecture', readError)
    back('save')
  }
  if (!target) back('invalid')
  if (target.is_default) back('default-delete')

  const { error } = await db.from('dashboards').delete().eq('id', id)
  if (error) {
    console.error('[dashboards] suppression', error)
    back('save')
  }
  revalidatePath('/')
  back('deleted')
}
