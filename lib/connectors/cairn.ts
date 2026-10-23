import { createClient } from '@/lib/supabase/server'
import { endOfToday } from '@/lib/time'
import type { Tables } from '@/lib/types/cairn'
import type { Connector } from './types'

/**
 * Lecture directe des tables Cairn avec la session de l'utilisateur : la RLS de
 * Cairn (`user_id = auth.uid()`) filtre tout, il n'y a aucune API à écrire.
 *
 * Coffre de Cairn : un contenu `is_encrypted` n'est jamais lu (seulement compté),
 * une note `is_private` / `hide_content` est désignée par son `code_name`.
 */

/** Nombre maximal d'items affichés dans le widget « À faire ». */
const TODO_LIMIT = 15
/** Items lus au plus, pour garder une requête bornée. */
const FETCH_LIMIT = 500

type NoteRow = Tables<'notes'>
type ItemRow = Tables<'checklist_items'>

type NoteFields = Pick<
  NoteRow,
  'id' | 'title' | 'code_name' | 'is_private' | 'hide_content' | 'is_encrypted' | 'position'
>

export type TodoItem = {
  id: string
  /** Texte de l'item, ou `null` s'il est masqué (note privée). */
  content: string | null
  noteId: string
  noteLabel: string
  dueAt: string | null
  /** Échéance aujourd'hui ou dépassée. */
  isDue: boolean
}

export type PinnedNote = { id: string; label: string }

export type Todo = {
  items: TodoItem[]
  /** Items non affichés au-delà de la limite. */
  moreCount: number
  pinned: PinnedNote[]
  /** Items et notes épinglées chiffrés par le coffre : comptés, jamais lus. */
  privateCount: number
}

export type ShoppingItem = { id: string; content: string }

export type Shopping =
  | { status: 'unset' }
  | { status: 'missing' }
  | { status: 'ok'; noteId: string; label: string; items: ShoppingItem[]; privateCount: number }

const NOTE_FIELDS = 'id, title, code_name, is_private, hide_content, is_encrypted, position'

/** Libellé d'une note tel que Cairn l'affiche. */
export function noteLabel(note: Pick<NoteRow, 'title' | 'code_name' | 'is_private' | 'hide_content'>) {
  if (note.is_private || note.hide_content) return note.code_name || 'Note privée'
  return note.title?.trim() || 'Sans titre'
}

function isMasked(note: Pick<NoteRow, 'is_private' | 'hide_content'>) {
  return note.is_private || note.hide_content
}

async function readShoppingChecklistId() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .schema('synapse')
    .from('settings')
    .select('cairn_shopping_checklist_id')
    .maybeSingle()
  if (error) throw error
  return (data?.cairn_shopping_checklist_id as string | null | undefined) ?? null
}

type TodoRow = Pick<ItemRow, 'id' | 'content' | 'is_encrypted' | 'due_at' | 'position' | 'note_id'> & {
  notes: NoteFields
  reminders: { remind_at: string }[]
}

export function toTodo(rows: TodoRow[], pinnedNotes: NoteFields[], now = new Date()): Todo {
  const limit = endOfToday(now).getTime()
  let privateCount = 0
  const items: { item: TodoItem; notePosition: number; position: number }[] = []

  for (const row of rows) {
    if (row.is_encrypted || row.notes.is_encrypted) {
      privateCount++
      continue
    }
    // Échéance de l'item, sinon le premier rappel Cairn qui le vise.
    const dueAt = row.due_at ?? row.reminders.map((r) => r.remind_at).sort()[0] ?? null
    items.push({
      item: {
        id: row.id,
        content: isMasked(row.notes) ? null : row.content?.trim() || 'Sans texte',
        noteId: row.note_id,
        noteLabel: noteLabel(row.notes),
        dueAt,
        isDue: dueAt != null && Date.parse(dueAt) < limit,
      },
      notePosition: row.notes.position,
      position: row.position,
    })
  }

  items.sort((a, b) => {
    if (a.item.isDue !== b.item.isDue) return a.item.isDue ? -1 : 1
    if (a.item.isDue && b.item.isDue) return Date.parse(a.item.dueAt!) - Date.parse(b.item.dueAt!)
    return a.notePosition - b.notePosition || a.position - b.position
  })

  const pinned: PinnedNote[] = []
  for (const note of pinnedNotes) {
    if (note.is_encrypted) privateCount++
    else pinned.push({ id: note.id, label: noteLabel(note) })
  }

  return {
    items: items.slice(0, TODO_LIMIT).map(({ item }) => item),
    moreCount: Math.max(0, items.length - TODO_LIMIT),
    pinned,
    privateCount,
  }
}

export const todoConnector: Connector<Todo> = {
  id: 'cairn',
  async read() {
    const supabase = await createClient()
    const shoppingId = await readShoppingChecklistId()

    let itemsQuery = supabase
      .from('checklist_items')
      .select(
        `id, content, is_encrypted, due_at, position, note_id,
         notes!inner(${NOTE_FIELDS}, kind, is_archived, deleted_at),
         reminders(remind_at)`,
      )
      .eq('is_done', false)
      .eq('notes.kind', 'checklist')
      .eq('notes.is_archived', false)
      .is('notes.deleted_at', null)
      .limit(FETCH_LIMIT)
    // La liste de courses a son propre widget.
    if (shoppingId) itemsQuery = itemsQuery.neq('note_id', shoppingId)

    const [items, pinned] = await Promise.all([
      itemsQuery,
      supabase
        .from('notes')
        .select(NOTE_FIELDS)
        .eq('is_pinned', true)
        .eq('is_archived', false)
        .is('deleted_at', null)
        .order('position'),
    ])
    if (items.error) throw items.error
    if (pinned.error) throw pinned.error

    return {
      data: toTodo(items.data as unknown as TodoRow[], pinned.data as NoteFields[]),
      syncedAt: null,
    }
  },
}

export const shoppingConnector: Connector<Shopping> = {
  id: 'cairn',
  async read() {
    const noteId = await readShoppingChecklistId()
    if (!noteId) return { data: { status: 'unset' }, syncedAt: null }

    const supabase = await createClient()
    const { data: note, error } = await supabase
      .from('notes')
      .select(NOTE_FIELDS)
      .eq('id', noteId)
      .eq('kind', 'checklist')
      .is('deleted_at', null)
      .maybeSingle()
    if (error) throw error
    // Supprimée, ou passée au coffre depuis le réglage : Synapse ne sait pas la lire.
    if (!note || note.is_encrypted) return { data: { status: 'missing' }, syncedAt: null }

    const { data: rows, error: itemsError } = await supabase
      .from('checklist_items')
      .select('id, content, is_encrypted')
      .eq('note_id', noteId)
      .eq('is_done', false)
      .order('position')
      .limit(FETCH_LIMIT)
    if (itemsError) throw itemsError

    const items: ShoppingItem[] = []
    let privateCount = 0
    for (const row of rows as Pick<ItemRow, 'id' | 'content' | 'is_encrypted'>[]) {
      if (row.is_encrypted) privateCount++
      else items.push({ id: row.id, content: row.content?.trim() || 'Sans texte' })
    }

    return {
      data: { status: 'ok', noteId, label: noteLabel(note as NoteFields), items, privateCount },
      syncedAt: null,
    }
  },
}

/** Checklists proposées pour les courses : jamais celles du coffre. */
export async function listShoppingCandidates() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('notes')
    .select(NOTE_FIELDS)
    .eq('kind', 'checklist')
    .eq('is_encrypted', false)
    .eq('is_archived', false)
    .is('deleted_at', null)
    .order('position')
  if (error) throw error
  return (data as NoteFields[]).map((note) => ({ id: note.id, label: noteLabel(note) }))
}

/** Lien « Ouvrir dans Cairn », ou `null` si l'URL de Cairn n'est pas configurée. */
export function cairnNoteUrl(noteId: string) {
  const base = process.env.NEXT_PUBLIC_CAIRN_URL?.replace(/\/+$/, '')
  return base ? `${base}/note/${noteId}` : null
}
