'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { sectionState, type ShoppingState } from '@/lib/settings/section-state'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Coche ou décoche un item Cairn. Écriture de données uniquement (`is_done`),
 * autorisée par la RLS de Cairn ; jamais sur un item chiffré par le coffre.
 */
export async function setChecklistItemDone(itemId: string, done: boolean): Promise<{ error?: string }> {
  if (!UUID.test(itemId)) return { error: 'Item inconnu.' }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('checklist_items')
    .update({ is_done: done })
    .eq('id', itemId)
    .eq('is_encrypted', false)
    .select('id')
  if (error) {
    console.error('[cairn] cocher un item', error)
    return { error: 'Impossible de mettre à jour Cairn.' }
  }
  if (!data?.length) return { error: 'Item introuvable dans Cairn.' }

  revalidatePath('/')
  return {}
}

/** Longueur maximale du texte d'un item. */
const CONTENT_MAX = 500

/** Texte d'item nettoyé (rogné), ou l'erreur à afficher : jamais tronqué en silence. */
function cleanContent(raw: unknown): { content: string } | { error: string } {
  const content = typeof raw === 'string' ? raw.trim() : ''
  if (!content) return { error: 'Le texte est vide.' }
  if (content.length > CONTENT_MAX) return { error: `Texte trop long (${CONTENT_MAX} caractères au plus).` }
  return { content }
}

/**
 * Ajoute un item en fin de checklist Cairn. Écriture de données uniquement (`insert`),
 * autorisée par la RLS de Cairn ; la checklist est revérifiée (non chiffrée, non supprimée),
 * jamais d'écriture dans le coffre.
 */
export async function addChecklistItem(noteId: string, content: string): Promise<{ error?: string; id?: string }> {
  if (!UUID.test(noteId)) return { error: 'Checklist inconnue.' }
  const cleaned = cleanContent(content)
  if ('error' in cleaned) return cleaned

  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return { error: 'Session expirée, reconnecte-toi.' }

  const [note, last] = await Promise.all([
    supabase
      .from('notes')
      .select('id')
      .eq('id', noteId)
      .eq('kind', 'checklist')
      .eq('is_encrypted', false)
      .is('deleted_at', null)
      .maybeSingle(),
    supabase
      .from('checklist_items')
      .select('position')
      .eq('note_id', noteId)
      .order('position', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])
  if (note.error || last.error) {
    console.error('[cairn] lecture de la checklist', note.error ?? last.error)
    return { error: 'Impossible de lire la checklist Cairn.' }
  }
  if (!note.data) return { error: 'Checklist introuvable ou passée au coffre.' }

  const start = ((last.data?.position as number | undefined) ?? -1) + 1
  const { data, error } = await supabase
    .from('checklist_items')
    .insert({ note_id: noteId, user_id: auth.user.id, content: cleaned.content, position: start })
    .select('id')
    .single()
  if (error) {
    console.error('[cairn] ajout d’un item', error)
    return { error: 'Impossible d’écrire dans Cairn.' }
  }

  revalidatePath('/')
  return { id: data.id as string }
}

/**
 * Modifie le texte d'un item Cairn. Écriture de données uniquement (`content`),
 * autorisée par la RLS de Cairn ; refusée sur un item chiffré et sur une note
 * privée, masquée, chiffrée ou supprimée (jamais de contenu du coffre).
 */
export async function updateChecklistItemContent(itemId: string, content: string): Promise<{ error?: string }> {
  if (!UUID.test(itemId)) return { error: 'Item inconnu.' }
  const cleaned = cleanContent(content)
  if ('error' in cleaned) return cleaned

  const supabase = await createClient()
  const { data: item, error: readError } = await supabase
    .from('checklist_items')
    .select('id, notes!inner(is_private, hide_content, is_encrypted, deleted_at)')
    .eq('id', itemId)
    .eq('is_encrypted', false)
    .maybeSingle()
  if (readError) {
    console.error('[cairn] lecture d’un item', readError)
    return { error: 'Impossible de lire Cairn.' }
  }
  if (!item) return { error: 'Item introuvable dans Cairn.' }
  const note = item.notes as unknown as {
    is_private: boolean
    hide_content: boolean
    is_encrypted: boolean
    deleted_at: string | null
  }
  if (note.is_private || note.hide_content || note.is_encrypted || note.deleted_at !== null) {
    return { error: 'Cet élément ne peut pas être modifié depuis Synapse.' }
  }

  const { data, error } = await supabase
    .from('checklist_items')
    .update({ content: cleaned.content })
    .eq('id', itemId)
    .eq('is_encrypted', false)
    .select('id')
  if (error) {
    console.error('[cairn] modifier un item', error)
    return { error: 'Impossible de mettre à jour Cairn.' }
  }
  if (!data?.length) return { error: 'Item introuvable dans Cairn.' }

  revalidatePath('/')
  return {}
}

/**
 * Enregistre la checklist Cairn des courses (`synapse.settings`), jamais une checklist du coffre.
 * Action de `useActionState` : renvoie le code du message à afficher dans la section.
 */
export async function saveShoppingChecklist(_prev: ShoppingState, formData: FormData): Promise<ShoppingState> {
  const raw = formData.get('note_id')
  const noteId = typeof raw === 'string' && raw !== '' ? raw : null
  // Le choix envoyé est renvoyé avec chaque résultat : le formulaire se réinitialise après l'action.
  const state = (code: string) => ({ ...sectionState(code), noteId: noteId ?? '' })
  if (noteId && !UUID.test(noteId)) return state('invalid')

  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) redirect('/login')

  if (noteId) {
    const { data: note, error } = await supabase
      .from('notes')
      .select('id')
      .eq('id', noteId)
      .eq('kind', 'checklist')
      .eq('is_encrypted', false)
      .is('deleted_at', null)
      .maybeSingle()
    if (error) console.error('[cairn] vérification de la checklist', error)
    if (!note) return state('invalid')
  }

  // Upsert limité à cette colonne : les autres réglages (météo…) restent intacts.
  const { error } = await supabase
    .schema('synapse')
    .from('settings')
    .upsert({ user_id: auth.user.id, cairn_shopping_checklist_id: noteId }, { onConflict: 'user_id' })
  if (error) {
    console.error('[settings] enregistrement de la checklist des courses', error)
    return state('save')
  }

  revalidatePath('/')
  revalidatePath('/settings')
  return state('saved')
}
