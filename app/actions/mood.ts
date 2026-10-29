'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { HABITS_MAX } from '@/lib/connectors/mood'
import { dayKey } from '@/lib/time'
import { sectionState, type HabitState, type SectionState } from '@/lib/settings/section-state'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const NOTE_MAX = 500
const HABIT_NAME_MAX = 80

/** Humeur du jour (1 à 5). Le mot éventuel déjà saisi est conservé. */
export async function setMood(score: number): Promise<{ error?: string }> {
  if (!Number.isInteger(score) || score < 1 || score > 5) return { error: 'Humeur inconnue.' }

  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return { error: 'Session expirée, reconnecte-toi.' }

  // Upsert limité à `score` : la note du jour reste intacte.
  const { error } = await supabase
    .schema('synapse')
    .from('mood_entries')
    .upsert({ user_id: auth.user.id, day: dayKey(new Date()), score }, { onConflict: 'user_id,day' })
  if (error) {
    console.error('[mood] enregistrement', error)
    return { error: 'Enregistrement impossible, réessaie.' }
  }

  revalidatePath('/')
  return {}
}

/** Mot du jour, attaché à l'humeur déjà choisie. Vide = effacé. */
export async function saveMoodNote(note: string): Promise<{ error?: string }> {
  const text = note.trim()
  if (text.length > NOTE_MAX) return { error: `${NOTE_MAX} caractères au plus.` }

  const supabase = await createClient()
  const { data, error } = await supabase
    .schema('synapse')
    .from('mood_entries')
    .update({ note: text || null })
    .eq('day', dayKey(new Date()))
    .select('day')
  if (error) {
    console.error('[mood] enregistrement de la note', error)
    return { error: 'Enregistrement impossible, réessaie.' }
  }
  if (!data?.length) return { error: 'Choisis d’abord une humeur.' }

  revalidatePath('/')
  return {}
}

/** Coche ou décoche une habitude pour aujourd'hui. */
export async function setHabitDone(habitId: string, done: boolean): Promise<{ error?: string }> {
  if (!UUID.test(habitId)) return { error: 'Habitude inconnue.' }

  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return { error: 'Session expirée, reconnecte-toi.' }

  const day = dayKey(new Date())
  const checks = supabase.schema('synapse').from('habit_checks')
  // La clé étrangère (habit_id, user_id) refuse une habitude d'un autre compte.
  const { error } = done
    ? await checks.upsert(
        { user_id: auth.user.id, habit_id: habitId, day },
        { onConflict: 'habit_id,day', ignoreDuplicates: true },
      )
    : await checks.delete().eq('habit_id', habitId).eq('day', day)
  if (error) {
    console.error('[habits] cocher', error)
    return { error: 'Enregistrement impossible, réessaie.' }
  }

  revalidatePath('/')
  return {}
}

/**
 * Nouvelle habitude, en fin de liste. Action de `useActionState` : sur une erreur, le nom saisi est
 * renvoyé pour rester dans le champ.
 */
export async function addHabit(_prev: HabitState, formData: FormData): Promise<HabitState> {
  const raw = formData.get('name')
  const name = typeof raw === 'string' ? raw.trim() : ''
  if (!name || name.length > HABIT_NAME_MAX) return { ...sectionState('name'), name }

  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) redirect('/login')

  const { data: active, error: readError } = await supabase
    .schema('synapse')
    .from('habits')
    .select('position')
    .is('archived_at', null)
    .order('position', { ascending: false })
  if (readError) {
    console.error('[habits] lecture', readError)
    return { ...sectionState('save'), name }
  }
  if (active.length >= HABITS_MAX) return { ...sectionState('max'), name }

  const position = ((active[0]?.position as number | undefined) ?? -1) + 1
  const { error } = await supabase
    .schema('synapse')
    .from('habits')
    .insert({ user_id: auth.user.id, name, position })
  if (error) {
    console.error('[habits] création', error)
    return { ...sectionState('save'), name }
  }

  revalidatePath('/')
  revalidatePath('/settings')
  return sectionState('added')
}

/** Retire une habitude du dashboard, sans effacer ses jours cochés. Action de `useActionState`. */
export async function archiveHabit(_prev: SectionState, formData: FormData): Promise<SectionState> {
  const raw = formData.get('id')
  const id = typeof raw === 'string' ? raw : ''
  if (!UUID.test(id)) return sectionState('save')

  const supabase = await createClient()
  const { error } = await supabase
    .schema('synapse')
    .from('habits')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', id)
  if (error) {
    console.error('[habits] archivage', error)
    return sectionState('save')
  }

  revalidatePath('/')
  revalidatePath('/settings')
  return sectionState('archived')
}
