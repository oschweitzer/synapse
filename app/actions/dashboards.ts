'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { isAdminUser } from '@/lib/admin'
import { sectionState, type DashboardCreateState, type SectionState } from '@/lib/settings/section-state'
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

/**
 * Session + droit d'administration, vérifiés côté serveur (le masquage de l'UI ne protège rien).
 * Sans session : redirection vers /login ; sans droit : `null`, l'action renvoie « forbidden ».
 */
async function requireAdmin() {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) redirect('/login')
  if (!isAdminUser(auth.user)) return null
  return { supabase, user: auth.user }
}

function readName(formData: FormData): string | null {
  const name = String(formData.get('name') ?? '').trim()
  return name.length >= 1 && name.length <= DASHBOARD_NAME_MAX ? name : null
}

function readId(formData: FormData): string | null {
  const id = String(formData.get('id') ?? '')
  return UUID.test(id) ? id : null
}

function readVisibility(formData: FormData): Visibility | null {
  const value = formData.get('visibility')
  return isVisibility(value) ? value : null
}

/** Succès : les deux pages qui listent les dashboards sont rafraîchies, puis l'état est renvoyé. */
function done(code: string): SectionState {
  revalidatePath('/')
  revalidatePath('/settings')
  return sectionState(code)
}

/**
 * Crée un dashboard vide (les widgets se choisissent ensuite). Action `useActionState` : le nom et la visibilité
 * envoyés reviennent avec l'erreur, pour rester dans le formulaire.
 */
export async function createDashboard(_prev: DashboardCreateState, formData: FormData): Promise<DashboardCreateState> {
  const admin = await requireAdmin()
  if (!admin) return sectionState('forbidden')
  const { supabase } = admin

  const typed = String(formData.get('name') ?? '').trim()
  const rawVisibility = formData.get('visibility')
  const kept = { name: typed, visibility: isVisibility(rawVisibility) ? rawVisibility : 'private' }
  const fail = (code: string) => ({ ...sectionState(code), ...kept })

  const name = readName(formData)
  if (!name) return fail('name')
  const visibility = readVisibility(formData)
  if (!visibility) return fail('invalid')

  const db = supabase.schema('synapse')
  const { count, error: countError } = await db.from('dashboards').select('id', { count: 'exact', head: true })
  if (countError) {
    console.error('[dashboards] comptage', countError)
    return fail('save')
  }
  if ((count ?? 0) >= DASHBOARDS_MAX) return fail('max')

  // La position et la limite sont aussi tenues par la base (migration 0012) : deux créations simultanées peuvent
  // passer le comptage ci-dessus.
  const { error } = await db.from('dashboards').insert({ name, visibility })
  if (error) {
    if (error.message === 'dashboards_max') return fail('max')
    console.error('[dashboards] création', error)
    return fail('save')
  }
  return done('created')
}

/** Renomme un dashboard, change sa visibilité, ses widgets et leur ordre (celui du formulaire, sauf s'il a changé entre-temps). Action `useActionState`. */
export async function saveDashboard(_prev: SectionState, formData: FormData): Promise<SectionState> {
  const admin = await requireAdmin()
  if (!admin) return sectionState('forbidden')
  const { supabase } = admin
  const id = readId(formData)
  if (!id) return sectionState('invalid')
  const name = readName(formData)
  if (!name) return sectionState('name')
  const visibility = readVisibility(formData)
  if (!visibility) return sectionState('invalid')
  const checked = normalizeWidgets(formData.getAll('widgets').map(String))
  const db = supabase.schema('synapse')

  // Si l'ordre enregistré a changé depuis l'affichage du formulaire (autre onglet, glisser-déposer du dashboard), on le
  // garde pour les widgets encore cochés et on ajoute les nouveaux à la suite, dans l'ordre du formulaire.
  const initial = formData.get('initialWidgets')
  let widgets = checked
  if (typeof initial === 'string') {
    const { data: current, error: readError } = await db
      .from('dashboard_widgets')
      .select('widget_id')
      .eq('dashboard_id', id)
      .order('position')
    if (readError) {
      console.error('[dashboards] lecture des widgets', readError)
      return sectionState('save')
    }
    const stored = normalizeWidgets(current.map((w) => w.widget_id))
    if (stored.join(',') !== normalizeWidgets(initial.split(',')).join(',')) {
      widgets = [...stored.filter((w) => checked.includes(w)), ...checked.filter((w) => !stored.includes(w))]
    }
  }

  // Un dashboard public ne sert que la session Supabase : pas de données sensibles dessus.
  if (visibility === 'public' && sensitiveWidgets(widgets).length > 0) return sectionState('sensitive')

  const { data: updated, error } = await db.from('dashboards').update({ name, visibility }).eq('id', id).select('id')
  if (error || updated.length === 0) {
    if (error) console.error('[dashboards] modification', error)
    return sectionState(error ? 'save' : 'invalid')
  }
  const { error: widgetsError } = await db.rpc('set_dashboard_widgets', { p_dashboard: id, p_widgets: widgets })
  if (widgetsError) {
    console.error('[dashboards] enregistrement des widgets', widgetsError)
    return sectionState('save')
  }
  return done('saved')
}

/** Remet les widgets d'un dashboard dans l'ordre par défaut du catalogue. Action `useActionState`. */
export async function resetDashboardOrder(_prev: SectionState, formData: FormData): Promise<SectionState> {
  const admin = await requireAdmin()
  if (!admin) return sectionState('forbidden')
  const { supabase } = admin
  const id = readId(formData)
  if (!id) return sectionState('invalid')

  const db = supabase.schema('synapse')
  const { data: current, error: readError } = await db.from('dashboard_widgets').select('widget_id').eq('dashboard_id', id)
  if (readError) {
    console.error('[dashboards] lecture des widgets', readError)
    return sectionState('save')
  }
  const present = new Set(current.map((w) => w.widget_id))
  const { error } = await db.rpc('set_dashboard_widgets', {
    p_dashboard: id,
    p_widgets: WIDGET_IDS.filter((w) => present.has(w)),
  })
  if (error) {
    console.error('[dashboards] réinitialisation de l’ordre', error)
    return sectionState('save')
  }
  return done('order-reset')
}

/** Désigne le dashboard affiché par défaut. Action `useActionState`. */
export async function setDefaultDashboard(_prev: SectionState, formData: FormData): Promise<SectionState> {
  const admin = await requireAdmin()
  if (!admin) return sectionState('forbidden')
  const { supabase } = admin
  const id = readId(formData)
  if (!id) return sectionState('invalid')

  const { error } = await supabase.schema('synapse').rpc('set_default_dashboard', { p_dashboard: id })
  if (error) {
    console.error('[dashboards] dashboard par défaut', error)
    return sectionState('save')
  }
  return done('default')
}

/** Supprime un dashboard ; le dashboard par défaut ne peut pas l'être. Action `useActionState`. */
export async function deleteDashboard(_prev: SectionState, formData: FormData): Promise<SectionState> {
  const admin = await requireAdmin()
  if (!admin) return sectionState('forbidden')
  const { supabase } = admin
  const id = readId(formData)
  if (!id) return sectionState('invalid')

  const db = supabase.schema('synapse')
  const { data: target, error: readError } = await db.from('dashboards').select('is_default').eq('id', id).maybeSingle()
  if (readError) {
    console.error('[dashboards] lecture', readError)
    return sectionState('save')
  }
  if (!target) return sectionState('invalid')
  if (target.is_default) return sectionState('default-delete')

  const { error } = await db.from('dashboards').delete().eq('id', id)
  if (error) {
    console.error('[dashboards] suppression', error)
    return sectionState('save')
  }
  return done('deleted')
}
