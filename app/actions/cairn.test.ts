import { describe, it, expect, vi, beforeEach } from 'vitest'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { mockServerClient, testUser, type MockResult } from '@/test/supabase-mock'
import { expectRedirect, form, throwRedirect } from '@/test/next-mock'
import { saveShoppingChecklist, setChecklistItemDone } from './cairn'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const ID = '11111111-1111-4111-8111-111111111111'

function setup(opts: Parameters<typeof mockServerClient>[0] = {}) {
  return mockServerClient({ user: testUser(), ...opts })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(redirect).mockImplementation(throwRedirect)
  vi.spyOn(console, 'error').mockImplementation(() => {})
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

  it('redirige vers /settings?error=invalid avant tout appel si note_id n’est pas un UUID', async () => {
    await expectRedirect(saveShoppingChecklist(form({ note_id: 'nope' })), '/settings?error=invalid')
    expect(createClient).not.toHaveBeenCalled()
  })

  it('redirige vers /login sans session', async () => {
    setup({ user: null })
    await expectRedirect(saveShoppingChecklist(form({ note_id: ID })), '/login')
  })

  it('refuse une note introuvable (ou chiffrée, ou d’un autre compte)', async () => {
    const { calls } = setup({ tables: { notes: { data: null }, 'synapse.settings': upsertOk } })
    await expectRedirect(saveShoppingChecklist(form({ note_id: ID })), '/settings?error=invalid')
    expect(calls.some((c) => c.method === 'upsert')).toBe(false)
  })

  it('redirige vers ?error=save si l’enregistrement échoue', async () => {
    setup({ tables: { notes: { data: { id: ID } }, 'synapse.settings': { error: { message: 'boom' } } } })
    await expectRedirect(saveShoppingChecklist(form({ note_id: ID })), '/settings?error=save')
  })

  it('enregistre la checklist dans le schéma synapse puis confirme', async () => {
    const { calls } = setup({ tables: { notes: { data: { id: ID } }, 'synapse.settings': upsertOk } })
    await expectRedirect(saveShoppingChecklist(form({ note_id: ID })), '/settings?saved=1')
    const upsert = calls.find((c) => c.method === 'upsert')
    expect(upsert).toMatchObject({ schema: 'synapse', table: 'settings' })
    expect(upsert?.args[0]).toEqual({ user_id: 'u1', cairn_shopping_checklist_id: ID })
    expect(revalidatePath).toHaveBeenCalledWith('/')
  })

  it('un note_id vide retire la checklist sans interroger les notes', async () => {
    const { calls } = setup({ tables: { 'synapse.settings': upsertOk } })
    await expectRedirect(saveShoppingChecklist(form({ note_id: '' })), '/settings?saved=1')
    expect(calls.find((c) => c.method === 'upsert')?.args[0]).toEqual({ user_id: 'u1', cairn_shopping_checklist_id: null })
    expect(calls.some((c) => c.table === 'notes')).toBe(false)
  })
})
