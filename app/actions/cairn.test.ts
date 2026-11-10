import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { mockServerClient, testUser, type MockResult } from '@/test/supabase-mock'
import { expectRedirect, form, throwRedirect } from '@/test/next-mock'
import { addChecklistItem, saveShoppingChecklist, setChecklistItemDone, updateChecklistItemContent } from './cairn'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const ID = '11111111-1111-4111-8111-111111111111'
const NEW_ID = '22222222-2222-4222-8222-222222222222'
const NOW = new Date('2026-01-15T10:00:00Z')

function setup(opts: Parameters<typeof mockServerClient>[0] = {}) {
  return mockServerClient({ user: testUser(), ...opts })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  vi.mocked(redirect).mockImplementation(throwRedirect)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
})

describe('setChecklistItemDone', () => {
  // Pas de lecture de session ici : la RLS de Cairn refuse l'écriture sans session,
  // ce qui revient à une liste vide (item masqué, chiffré ou d'un autre compte).
  it('refuse un id qui n’est pas un UUID, sans appeler Supabase', async () => {
    expect(await setChecklistItemDone('nope', true)).toEqual({ error: 'Item inconnu.' })
    expect(createClient).not.toHaveBeenCalled()
  })

  it('remonte une erreur Supabase sans revalider', async () => {
    setup({ tables: { checklist_items: { error: { message: 'boom' } } } })
    expect(await setChecklistItemDone(ID, true)).toEqual({ error: 'Impossible de mettre à jour Cairn.' })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('refuse un item masqué par la RLS ou chiffré (aucune ligne modifiée)', async () => {
    setup({ tables: { checklist_items: { data: [] } } })
    expect(await setChecklistItemDone(ID, true)).toEqual({ error: 'Item introuvable dans Cairn.' })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('coche un item en visant l’id et jamais un item chiffré', async () => {
    const { calls } = setup({ tables: { checklist_items: { data: [{ id: ID }] } } })
    expect(await setChecklistItemDone(ID, true)).toEqual({})
    const methods = calls.map((c) => [c.method, c.args])
    expect(methods).toContainEqual(['update', [{ is_done: true }]])
    expect(methods).toContainEqual(['eq', ['id', ID]])
    expect(methods).toContainEqual(['eq', ['is_encrypted', false]])
    expect(revalidatePath).toHaveBeenCalledWith('/')
  })
})

describe('saveShoppingChecklist', () => {
  const upsertOk: MockResult = { data: null }

  it('renvoie « invalid » avant tout appel si note_id n’est pas un UUID', async () => {
    expect(await saveShoppingChecklist(null, form({ note_id: 'nope' }))).toEqual({
      code: 'invalid',
      at: NOW.getTime(),
      noteId: 'nope',
    })
    expect(createClient).not.toHaveBeenCalled()
  })

  it('redirige vers /login sans session', async () => {
    setup({ user: null })
    await expectRedirect(saveShoppingChecklist(null, form({ note_id: ID })), '/login')
  })

  it('refuse une note introuvable (ou chiffrée, ou d’un autre compte)', async () => {
    const { calls } = setup({ tables: { notes: { data: null }, 'synapse.settings': upsertOk } })
    expect(await saveShoppingChecklist(null, form({ note_id: ID }))).toEqual({ code: 'invalid', at: NOW.getTime(), noteId: ID })
    expect(calls.some((c) => c.method === 'upsert')).toBe(false)
  })

  it('renvoie « save » sans revalider si l’enregistrement échoue', async () => {
    setup({ tables: { notes: { data: { id: ID } }, 'synapse.settings': { error: { message: 'boom' } } } })
    expect(await saveShoppingChecklist(null, form({ note_id: ID }))).toEqual({ code: 'save', at: NOW.getTime(), noteId: ID })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('enregistre la checklist dans le schéma synapse, revalide puis confirme', async () => {
    const { calls } = setup({ tables: { notes: { data: { id: ID } }, 'synapse.settings': upsertOk } })
    expect(await saveShoppingChecklist(null, form({ note_id: ID }))).toEqual({ code: 'saved', at: NOW.getTime(), noteId: ID })
    const upsert = calls.find((c) => c.method === 'upsert')
    expect(upsert).toMatchObject({ schema: 'synapse', table: 'settings' })
    expect(upsert?.args[0]).toEqual({ user_id: 'u1', cairn_shopping_checklist_id: ID })
    expect(revalidatePath).toHaveBeenCalledWith('/')
    expect(revalidatePath).toHaveBeenCalledWith('/settings')
  })

  it('un note_id vide retire la checklist sans interroger les notes', async () => {
    const { calls } = setup({ tables: { 'synapse.settings': upsertOk } })
    expect(await saveShoppingChecklist(null, form({ note_id: '' }))).toEqual({ code: 'saved', at: NOW.getTime(), noteId: '' })
    expect(calls.find((c) => c.method === 'upsert')?.args[0]).toEqual({ user_id: 'u1', cairn_shopping_checklist_id: null })
    expect(calls.some((c) => c.table === 'notes')).toBe(false)
  })

  it('chaque état renvoyé porte un horodatage numérique', async () => {
    setup({ tables: { 'synapse.settings': upsertOk } })
    const state = await saveShoppingChecklist(null, form({ note_id: '' }))
    expect(state?.at).toEqual(expect.any(Number))
  })
})

describe('addChecklistItem', () => {
  const ok = (over: { position?: number | null } = {}) => ({
    notes: { data: { id: ID } },
    checklist_items: [{ data: over.position === null ? null : { position: over.position ?? 4 } }, { data: { id: NEW_ID } }],
  })

  it('refuse un id qui n’est pas un UUID, sans appeler Supabase', async () => {
    expect(await addChecklistItem('nope', 'Beurre')).toEqual({ error: 'Checklist inconnue.' })
    expect(createClient).not.toHaveBeenCalled()
  })

  it('refuse un texte vide ou d’espaces, sans appeler Supabase', async () => {
    expect(await addChecklistItem(ID, '   ')).toEqual({ error: 'Le texte est vide.' })
    expect(createClient).not.toHaveBeenCalled()
  })

  it('refuse un texte de plus de 500 caractères, sans appeler Supabase', async () => {
    expect(await addChecklistItem(ID, 'a'.repeat(501))).toEqual({ error: 'Texte trop long (500 caractères au plus).' })
    expect(createClient).not.toHaveBeenCalled()
  })

  it('accepte un texte de 500 caractères', async () => {
    setup({ tables: ok() })
    expect(await addChecklistItem(ID, 'a'.repeat(500))).toEqual({ id: NEW_ID })
  })

  it('refuse sans session et n’écrit rien', async () => {
    const { calls } = setup({ user: null, tables: ok() })
    expect(await addChecklistItem(ID, 'Beurre')).toEqual({ error: 'Session expirée, reconnecte-toi.' })
    expect(calls.some((c) => c.method === 'insert')).toBe(false)
  })

  it('refuse une checklist introuvable, chiffrée ou supprimée, sans écrire', async () => {
    const { calls } = setup({ tables: { notes: { data: null }, checklist_items: [{ data: null }] } })
    expect(await addChecklistItem(ID, 'Beurre')).toEqual({ error: 'Checklist introuvable ou passée au coffre.' })
    expect(calls.some((c) => c.method === 'insert')).toBe(false)
    const notes = calls.filter((c) => c.table === 'notes').map((c) => [c.method, c.args])
    expect(notes).toContainEqual(['eq', ['id', ID]])
    expect(notes).toContainEqual(['eq', ['kind', 'checklist']])
    expect(notes).toContainEqual(['eq', ['is_encrypted', false]])
    expect(notes).toContainEqual(['is', ['deleted_at', null]])
  })

  it('remonte une erreur de lecture sans écrire', async () => {
    const { calls } = setup({ tables: { notes: { error: { message: 'boom' } }, checklist_items: [{ data: null }] } })
    expect(await addChecklistItem(ID, 'Beurre')).toEqual({ error: 'Impossible de lire la checklist Cairn.' })
    expect(calls.some((c) => c.method === 'insert')).toBe(false)
  })

  it('remonte une erreur d’écriture sans revalider', async () => {
    setup({ tables: { notes: { data: { id: ID } }, checklist_items: [{ data: { position: 1 } }, { error: { message: 'boom' } }] } })
    expect(await addChecklistItem(ID, 'Beurre')).toEqual({ error: 'Impossible d’écrire dans Cairn.' })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('ajoute le texte rogné en fin de liste, renvoie l’id et revalide', async () => {
    const { calls } = setup({ tables: ok() })
    expect(await addChecklistItem(ID, '  Beurre ')).toEqual({ id: NEW_ID })
    expect(calls.find((c) => c.method === 'insert')?.args[0]).toEqual({ note_id: ID, user_id: 'u1', content: 'Beurre', position: 5 })
    expect(revalidatePath).toHaveBeenCalledWith('/')
  })

  it('commence à la position 0 sur une checklist vide', async () => {
    const { calls } = setup({ tables: ok({ position: null }) })
    await addChecklistItem(ID, 'Beurre')
    expect(calls.find((c) => c.method === 'insert')?.args[0]).toMatchObject({ position: 0 })
  })
})

describe('updateChecklistItemContent', () => {
  const readRow = (note: Partial<Record<string, unknown>> = {}) => ({
    id: ID,
    notes: { is_private: false, hide_content: false, is_encrypted: false, deleted_at: null, ...note },
  })

  it('refuse un id invalide ou un texte vide, sans appeler Supabase', async () => {
    expect(await updateChecklistItemContent('nope', 'Pain')).toEqual({ error: 'Item inconnu.' })
    expect(await updateChecklistItemContent(ID, '  ')).toEqual({ error: 'Le texte est vide.' })
    expect(await updateChecklistItemContent(ID, 'a'.repeat(501))).toEqual({ error: 'Texte trop long (500 caractères au plus).' })
    expect(createClient).not.toHaveBeenCalled()
  })

  it('refuse un item introuvable ou chiffré (lecture vide), sans modifier', async () => {
    const { calls } = setup({ tables: { checklist_items: [{ data: null }] } })
    expect(await updateChecklistItemContent(ID, 'Pain')).toEqual({ error: 'Item introuvable dans Cairn.' })
    expect(calls.some((c) => c.method === 'update')).toBe(false)
  })

  it('remonte une erreur de lecture, sans modifier', async () => {
    const { calls } = setup({ tables: { checklist_items: [{ error: { message: 'boom' } }] } })
    expect(await updateChecklistItemContent(ID, 'Pain')).toEqual({ error: 'Impossible de lire Cairn.' })
    expect(calls.some((c) => c.method === 'update')).toBe(false)
  })

  it.each([
    ['privée', { is_private: true }],
    ['masquée', { hide_content: true }],
    ['chiffrée', { is_encrypted: true }],
    ['supprimée', { deleted_at: '2026-01-01T00:00:00Z' }],
  ])('refuse un item d’une note %s, sans modifier', async (_label, note) => {
    const { calls } = setup({ tables: { checklist_items: [{ data: readRow(note) }, { data: [{ id: ID }] }] } })
    expect(await updateChecklistItemContent(ID, 'Pain')).toEqual({ error: 'Cet élément ne peut pas être modifié depuis Synapse.' })
    expect(calls.some((c) => c.method === 'update')).toBe(false)
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('met à jour le seul contenu rogné, jamais un item chiffré, puis revalide', async () => {
    const { calls } = setup({ tables: { checklist_items: [{ data: readRow() }, { data: [{ id: ID }] }] } })
    expect(await updateChecklistItemContent(ID, ' Pain complet ')).toEqual({})
    const methods = calls.map((c) => [c.method, c.args])
    expect(methods).toContainEqual(['update', [{ content: 'Pain complet' }]])
    expect(methods.filter(([m]) => m === 'update')).toHaveLength(1)
    expect(methods).toContainEqual(['eq', ['id', ID]])
    expect(methods).toContainEqual(['eq', ['is_encrypted', false]])
    expect(revalidatePath).toHaveBeenCalledWith('/')
  })

  it('remonte une erreur d’écriture sans revalider', async () => {
    setup({ tables: { checklist_items: [{ data: readRow() }, { error: { message: 'boom' } }] } })
    expect(await updateChecklistItemContent(ID, 'Pain')).toEqual({ error: 'Impossible de mettre à jour Cairn.' })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('refuse quand aucune ligne n’est modifiée', async () => {
    setup({ tables: { checklist_items: [{ data: readRow() }, { data: [] }] } })
    expect(await updateChecklistItemContent(ID, 'Pain')).toEqual({ error: 'Item introuvable dans Cairn.' })
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})
