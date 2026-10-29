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
