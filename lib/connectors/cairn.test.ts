import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createClient } from '@/lib/supabase/server'
import {
  cairnNoteUrl,
  listShoppingCandidates,
  noteLabel,
  readShoppingChecklistId,
  shoppingConnector,
  toTodo,
  todoConnector,
} from '@/lib/connectors/cairn'
import { mockSupabase, type MockResult } from '@/test/supabase-mock'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))

type Row = Parameters<typeof toTodo>[0][number]
type Note = Row['notes']

// 15 janvier 2026, 11 h à Paris : la journée se termine le 15 à 23:00Z.
const NOW = new Date('2026-01-15T10:00:00Z')

const note = (over: Partial<Note> = {}): Note => ({
  id: 'n1',
  title: 'Titre',
  code_name: null,
  is_private: false,
  hide_content: false,
  is_encrypted: false,
  position: 0,
  ...over,
})

const row = (over: Partial<Row> = {}): Row => ({
  id: 'i1',
  content: 'Acheter du pain',
  is_encrypted: false,
  due_at: null,
  position: 0,
  note_id: 'n1',
  notes: note(),
  reminders: [],
  ...over,
}) as Row

function setup(tables: Record<string, MockResult | MockResult[]>) {
  const m = mockSupabase({ tables })
  vi.mocked(createClient).mockResolvedValue(m.client as never)
  return m
}

beforeEach(() => {
  vi.mocked(createClient).mockReset()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('noteLabel', () => {
  it('désigne une note privée ou masquée par son nom de code', () => {
    expect(noteLabel(note({ is_private: true, code_name: 'X7' }))).toBe('X7')
    expect(noteLabel(note({ hide_content: true, code_name: 'Y1' }))).toBe('Y1')
  })

  it('retombe sur « Note privée » sans nom de code', () => {
    expect(noteLabel(note({ is_private: true, code_name: null }))).toBe('Note privée')
    expect(noteLabel(note({ hide_content: true, code_name: '' }))).toBe('Note privée')
  })

  it('montre le titre rogné d’une note ordinaire, sinon « Sans titre »', () => {
    expect(noteLabel(note({ title: '  Courses  ' }))).toBe('Courses')
    expect(noteLabel(note({ title: '   ' }))).toBe('Sans titre')
    expect(noteLabel(note({ title: null }))).toBe('Sans titre')
  })

  it('ne montre jamais le titre d’une note privée', () => {
    expect(noteLabel(note({ title: 'Secret', is_private: true, code_name: 'X7' }))).not.toContain('Secret')
  })
})

describe('toTodo', () => {
  it('compte sans les lire les items et notes chiffrés', () => {
    const todo = toTodo(
      [
        row({ id: 'a', is_encrypted: true, content: 'secret' }),
        row({ id: 'b', notes: note({ is_encrypted: true }), content: 'secret aussi' }),
        row({ id: 'c' }),
      ],
      NOW,
    )
    expect(todo.privateCount).toBe(2)
    expect(todo.items.map((i) => i.id)).toEqual(['c'])
    expect(JSON.stringify(todo)).not.toContain('secret')
  })

  it('masque le contenu d’une note privée et la désigne par son nom de code', () => {
    const [item] = toTodo([row({ notes: note({ is_private: true, code_name: 'X7' }) })], NOW).items
    expect(item).toMatchObject({ content: null, noteLabel: 'X7' })
  })

  it('montre le texte rogné, ou « Sans texte »', () => {
    const items = toTodo([row({ id: 'a', content: '  Lait ' }), row({ id: 'b', content: '  ', position: 1 }), row({ id: 'c', content: null, position: 2 })], NOW).items
    expect(items.map((i) => i.content)).toEqual(['Lait', 'Sans texte', 'Sans texte'])
  })

  it('prend l’échéance de l’item, sinon le plus ancien rappel', () => {
    const items = toTodo(
      [
        row({ id: 'a', due_at: '2026-01-20T08:00:00Z', reminders: [{ remind_at: '2026-01-10T08:00:00Z' }] }),
        row({
          id: 'b',
          reminders: [{ remind_at: '2026-01-18T08:00:00Z' }, { remind_at: '2026-01-17T08:00:00Z' }],
        }),
        row({ id: 'c' }),
      ],
      NOW,
    ).items
    const byId = Object.fromEntries(items.map((i) => [i.id, i.dueAt]))
    expect(byId).toEqual({ a: '2026-01-20T08:00:00Z', b: '2026-01-17T08:00:00Z', c: null })
  })

  it('marque « à échéance » ce qui est dû aujourd’hui ou avant', () => {
    const items = toTodo(
      [
        row({ id: 'past', due_at: '2026-01-10T08:00:00Z' }),
        row({ id: 'today', due_at: '2026-01-15T20:00:00Z' }),
        row({ id: 'tomorrow', due_at: '2026-01-15T23:30:00Z' }),
        row({ id: 'none' }),
      ],
      NOW,
    ).items
    const due = Object.fromEntries(items.map((i) => [i.id, i.isDue]))
    expect(due).toEqual({ past: true, today: true, tomorrow: false, none: false })
  })

  it('range les items dus d’abord par échéance, puis par position de note et d’item', () => {
    const items = toTodo(
      [
        row({ id: 'a', position: 0, notes: note({ position: 2 }) }),
        row({ id: 'b', position: 1, notes: note({ position: 1 }) }),
        row({ id: 'c', position: 0, notes: note({ position: 1 }) }),
        row({ id: 'd', due_at: '2026-01-15T08:00:00Z', notes: note({ position: 9 }) }),
        row({ id: 'e', due_at: '2026-01-14T08:00:00Z', notes: note({ position: 9 }) }),
      ],
      NOW,
    ).items
    expect(items.map((i) => i.id)).toEqual(['e', 'd', 'c', 'b', 'a'])
  })

  it('limite à 15 items et compte le reste', () => {
    const rows = Array.from({ length: 20 }, (_, i) => row({ id: `i${i}`, position: i }))
    const todo = toTodo(rows, NOW)
    expect(todo.items).toHaveLength(15)
    expect(todo.moreCount).toBe(5)
    expect(toTodo(rows.slice(0, 15), NOW).moreCount).toBe(0)
  })

  it('prend l’horloge du système par défaut', () => {
    const items = toTodo([row({ due_at: '2026-01-15T20:00:00Z' })]).items
    expect(items[0].isDue).toBe(true)
  })
})

describe('readShoppingChecklistId', () => {
  it('rend l’id choisi dans les réglages', async () => {
    setup({ settings: { data: { cairn_shopping_checklist_id: 'shop-1' } } })
    expect(await readShoppingChecklistId()).toBe('shop-1')
  })

  it('rend null sans ligne de réglages ou sans liste choisie', async () => {
    setup({ settings: { data: null } })
    expect(await readShoppingChecklistId()).toBeNull()
    setup({ settings: { data: { cairn_shopping_checklist_id: null } } })
    expect(await readShoppingChecklistId()).toBeNull()
  })

  it('lève l’erreur Supabase', async () => {
    const error = new Error('db down')
    setup({ settings: { error } })
    await expect(readShoppingChecklistId()).rejects.toBe(error)
  })
})

describe('todoConnector', () => {
  const items = [row({ id: 'a' })]

  it('a l’id « cairn »', () => {
    expect(todoConnector.id).toBe('cairn')
  })

  it('rend les items, sans date de synchro', async () => {
    setup({
      settings: { data: null },
      checklist_items: { data: items },
    })
    const result = await todoConnector.read('u1')
    expect(result.syncedAt).toBeNull()
    expect(result.data.items.map((i) => i.id)).toEqual(['a'])
    expect(result.error).toBeUndefined()
  })

  it('exclut la liste de courses quand elle est choisie', async () => {
    const m = setup({ settings: { data: { cairn_shopping_checklist_id: 'shop-1' } }, checklist_items: { data: items } })
    await todoConnector.read('u1')
    expect(m.calls).toContainEqual(expect.objectContaining({ table: 'checklist_items', method: 'neq', args: ['note_id', 'shop-1'] }))
  })

  it('n’exclut rien sans liste de courses', async () => {
    const m = setup({ settings: { data: null }, checklist_items: { data: items } })
    await todoConnector.read('u1')
    expect(m.calls.some((c) => c.method === 'neq')).toBe(false)
  })

  it('ne lit que les items non faits des checklists actives', async () => {
    const m = setup({ settings: { data: null }, checklist_items: { data: [] } })
    await todoConnector.read('u1')
    const filters = m.calls.filter((c) => c.table === 'checklist_items' && c.method === 'eq').map((c) => c.args)
    expect(filters).toEqual([
      ['is_done', false],
      ['notes.kind', 'checklist'],
      ['notes.is_archived', false],
    ])
  })

  it('lève l’erreur de lecture des items', async () => {
    const error = new Error('items down')
    setup({ settings: { data: null }, checklist_items: { error } })
    await expect(todoConnector.read('u1')).rejects.toBe(error)
  })

  it('ne lit pas les notes épinglées', async () => {
    const m = setup({ settings: { data: null }, checklist_items: { data: items } })
    await todoConnector.read('u1')
    expect(m.calls.some((c) => c.table === 'notes')).toBe(false)
    expect(m.calls.some((c) => c.method === 'eq' && c.args[0] === 'is_pinned')).toBe(false)
  })

  it('lève l’erreur de lecture des réglages', async () => {
    const error = new Error('settings down')
    setup({ settings: { error }, checklist_items: { data: [] } })
    await expect(todoConnector.read('u1')).rejects.toBe(error)
  })

  it('rend une liste vide sans donnée', async () => {
    setup({ settings: { data: null }, checklist_items: { data: [] } })
    expect(await todoConnector.read('u1')).toEqual({
      data: { items: [], moreCount: 0, privateCount: 0 },
      syncedAt: null,
    })
  })
})

describe('shoppingConnector', () => {
  const shopping = note({ id: 'shop-1', title: 'Courses' })

  it('a l’id « cairn »', () => {
    expect(shoppingConnector.id).toBe('cairn')
  })

  it('rend « unset » sans liste choisie, sans lire les notes', async () => {
    const m = setup({ settings: { data: null } })
    expect(await shoppingConnector.read('u1')).toEqual({ data: { status: 'unset' }, syncedAt: null })
    expect(m.calls.some((c) => c.table === 'notes')).toBe(false)
  })

  it('rend « missing » quand la note n’existe plus', async () => {
    setup({ settings: { data: { cairn_shopping_checklist_id: 'shop-1' } }, notes: { data: null } })
    expect((await shoppingConnector.read('u1')).data).toEqual({ status: 'missing' })
  })

  it('rend « missing » quand la note est passée au coffre, sans lire ses items', async () => {
    const m = setup({
      settings: { data: { cairn_shopping_checklist_id: 'shop-1' } },
      notes: { data: { ...shopping, is_encrypted: true } },
    })
    expect((await shoppingConnector.read('u1')).data).toEqual({ status: 'missing' })
    expect(m.calls.some((c) => c.table === 'checklist_items')).toBe(false)
  })

  it('rend les items, compte ceux du coffre', async () => {
    setup({
      settings: { data: { cairn_shopping_checklist_id: 'shop-1' } },
      notes: { data: shopping },
      checklist_items: {
        data: [
          { id: '1', content: ' Lait ', is_encrypted: false },
          { id: '2', content: null, is_encrypted: false },
          { id: '3', content: 'secret', is_encrypted: true },
        ],
      },
    })
    const result = await shoppingConnector.read('u1')
    expect(result).toEqual({
      data: {
        status: 'ok',
        noteId: 'shop-1',
        label: 'Courses',
        items: [
          { id: '1', content: 'Lait' },
          { id: '2', content: 'Sans texte' },
        ],
        privateCount: 1,
      },
      syncedAt: null,
    })
    expect(JSON.stringify(result)).not.toContain('secret')
  })

  it('rend « ok » avec une liste vide quand il n’y a rien à acheter', async () => {
    setup({
      settings: { data: { cairn_shopping_checklist_id: 'shop-1' } },
      notes: { data: shopping },
      checklist_items: { data: [] },
    })
    expect((await shoppingConnector.read('u1')).data).toMatchObject({ status: 'ok', items: [], privateCount: 0 })
  })

  it('lève l’erreur de lecture de la note', async () => {
    const error = new Error('notes down')
    setup({ settings: { data: { cairn_shopping_checklist_id: 'shop-1' } }, notes: { error } })
    await expect(shoppingConnector.read('u1')).rejects.toBe(error)
  })

  it('lève l’erreur de lecture des items', async () => {
    const error = new Error('items down')
    setup({
      settings: { data: { cairn_shopping_checklist_id: 'shop-1' } },
      notes: { data: shopping },
      checklist_items: { error },
    })
    await expect(shoppingConnector.read('u1')).rejects.toBe(error)
  })
})

describe('listShoppingCandidates', () => {
  it('rend les checklists avec leur libellé, hors coffre', async () => {
    const m = setup({
      notes: { data: [note({ id: 'a', title: 'Courses' }), note({ id: 'b', is_private: true, code_name: 'K2', title: 'Secret' })] },
    })
    expect(await listShoppingCandidates()).toEqual([
      { id: 'a', label: 'Courses' },
      { id: 'b', label: 'K2' },
    ])
    expect(m.calls).toContainEqual(expect.objectContaining({ method: 'eq', args: ['is_encrypted', false] }))
  })

  it('lève l’erreur Supabase', async () => {
    const error = new Error('notes down')
    setup({ notes: { error } })
    await expect(listShoppingCandidates()).rejects.toBe(error)
  })
})

describe('cairnNoteUrl', () => {
  it('compose le lien sans les barres finales', () => {
    vi.stubEnv('NEXT_PUBLIC_CAIRN_URL', 'https://cairn.x///')
    expect(cairnNoteUrl('abc')).toBe('https://cairn.x/note/abc')
  })

  it('rend null si l’URL de Cairn n’est pas configurée', () => {
    vi.stubEnv('NEXT_PUBLIC_CAIRN_URL', undefined)
    expect(cairnNoteUrl('abc')).toBeNull()
    vi.stubEnv('NEXT_PUBLIC_CAIRN_URL', '')
    expect(cairnNoteUrl('abc')).toBeNull()
  })
})
