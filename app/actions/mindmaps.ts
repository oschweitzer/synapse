'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Json } from '@/lib/types/synapse'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const TITLE_MAX = 120
const NODES_MAX = 1000
const EDGES_MAX = 2000

function title(formData: FormData) {
  const value = formData.get('title')
  return typeof value === 'string' ? value.trim() : ''
}

/** Crée une carte vide puis l'ouvre. */
export async function createMindmap(formData: FormData) {
  const name = title(formData) || 'Nouvelle carte'
  if (name.length > TITLE_MAX) redirect('/mindmaps?error=title')

  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) redirect('/login')

  const { data, error } = await supabase
    .schema('synapse')
    .from('mindmaps')
    .insert({ title: name, user_id: auth.user.id })
    .select('id')
    .single()
  if (error || !data) {
    console.error('[mindmaps] création', error)
    redirect('/mindmaps?error=save')
  }

  revalidatePath('/mindmaps')
  redirect(`/mindmaps/${data.id}`)
}

/** Supprime une carte (confirmation côté client). */
export async function deleteMindmap(formData: FormData) {
  const id = formData.get('id')
  if (typeof id !== 'string' || !UUID.test(id)) redirect('/mindmaps?error=unknown')

  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) redirect('/login')

  const { error } = await supabase.schema('synapse').from('mindmaps').delete().eq('id', id)
  if (error) {
    console.error('[mindmaps] suppression', error)
    redirect('/mindmaps?error=save')
  }

  revalidatePath('/mindmaps')
  redirect('/mindmaps')
}

export type MindmapPatch = { title?: string; nodes?: Json; edges?: Json; viewport?: Json | null }

/** Sauvegarde automatique : titre et/ou contenu de la carte. */
export async function saveMindmap(id: string, patch: MindmapPatch): Promise<{ error?: string }> {
  if (!UUID.test(id)) return { error: 'Carte inconnue.' }

  const fields: MindmapPatch = {}
  if (patch.title !== undefined) {
    const name = patch.title.trim()
    if (!name || name.length > TITLE_MAX) return { error: `Titre : 1 à ${TITLE_MAX} caractères.` }
    fields.title = name
  }
  if (patch.nodes !== undefined) {
    if (!Array.isArray(patch.nodes) || patch.nodes.length > NODES_MAX) return { error: `${NODES_MAX} éléments au plus.` }
    fields.nodes = patch.nodes
  }
  if (patch.edges !== undefined) {
    if (!Array.isArray(patch.edges) || patch.edges.length > EDGES_MAX) return { error: `${EDGES_MAX} liens au plus.` }
    fields.edges = patch.edges
  }
  if (patch.viewport !== undefined) fields.viewport = patch.viewport

  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return { error: 'Session expirée, reconnecte-toi.' }

  const { data, error } = await supabase.schema('synapse').from('mindmaps').update(fields).eq('id', id).select('id')
  if (error) {
    console.error('[mindmaps] enregistrement', error)
    return { error: 'Enregistrement impossible, réessaie.' }
  }
  if (!data?.length) return { error: 'Carte introuvable.' }
  return {}
}
