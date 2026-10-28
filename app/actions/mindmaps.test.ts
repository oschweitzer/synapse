import { describe, it, expect, vi, beforeEach } from 'vitest'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { mockServerClient, testUser } from '@/test/supabase-mock'
import { expectRedirect, form, throwRedirect } from '@/test/next-mock'
import { createMindmap, deleteMindmap, saveMindmap } from './mindmaps'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const ID = '11111111-1111-4111-8111-111111111111'
const boom = { message: 'boom' }
const SESSION_ERROR = { error: 'Session expirée, reconnecte-toi.' }

function setup(opts: Parameters<typeof mockServerClient>[0] = {}) {
  return mockServerClient({ user: testUser(), ...opts })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(redirect).mockImplementation(throwRedirect)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('createMindmap', () => {
  it('refuse un titre de plus de 120 caractères, avant tout appel', async () => {
    await expectRedirect(createMindmap(form({ title: 'x'.repeat(121) })), '/mindmaps?error=title')
    expect(createClient).not.toHaveBeenCalled()
  })

  it('redirige vers /login sans session', async () => {
    setup({ user: null })
    await expectRedirect(createMindmap(form({ title: 'Idées' })), '/login')
  })

  it('erreur Supabase : ?error=save', async () => {
    setup({ tables: { 'synapse.mindmaps': { error: boom } } })
    await expectRedirect(createMindmap(form({ title: 'Idées' })), '/mindmaps?error=save')
  })

  it('un titre vide devient « Nouvelle carte », rattachée à l’utilisateur', async () => {
    const { calls } = setup({ tables: { 'synapse.mindmaps': { data: { id: ID } } } })
    await expectRedirect(createMindmap(form({ title: '   ' })), `/mindmaps/${ID}`)
    expect(calls.find((c) => c.method === 'insert')?.args[0]).toEqual({ title: 'Nouvelle carte', user_id: 'u1' })
  })

  it('crée la carte, revalide la liste et l’ouvre', async () => {
    setup({ tables: { 'synapse.mindmaps': { data: { id: ID } } } })
    await expectRedirect(createMindmap(form({ title: 'Idées' })), `/mindmaps/${ID}`)
    expect(revalidatePath).toHaveBeenCalledWith('/mindmaps')
  })
})

describe('deleteMindmap', () => {
  it('refuse un id invalide, avant tout appel', async () => {
    await expectRedirect(deleteMindmap(form({ id: 'nope' })), '/mindmaps?error=unknown')
    expect(createClient).not.toHaveBeenCalled()
  })

  it('redirige vers /login sans session', async () => {
    setup({ user: null })
    await expectRedirect(deleteMindmap(form({ id: ID })), '/login')
  })

  it('erreur Supabase : ?error=save', async () => {
    setup({ tables: { 'synapse.mindmaps': { error: boom } } })
    await expectRedirect(deleteMindmap(form({ id: ID })), '/mindmaps?error=save')
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('supprime la carte puis revient à la liste', async () => {
    const { calls } = setup({ tables: { 'synapse.mindmaps': { data: null } } })
    await expectRedirect(deleteMindmap(form({ id: ID })), '/mindmaps')
    expect(calls).toContainEqual(expect.objectContaining({ method: 'eq', args: ['id', ID] }))
    expect(revalidatePath).toHaveBeenCalledWith('/mindmaps')
  })
})

describe('saveMindmap', () => {
  const items = (n: number) => Array.from({ length: n }, (_, i) => ({ id: String(i) }))

  it('refuse un id invalide, avant tout appel', async () => {
    expect(await saveMindmap('nope', { title: 'x' })).toEqual({ error: 'Carte inconnue.' })
    expect(createClient).not.toHaveBeenCalled()
  })

  it.each(['', '   ', 'x'.repeat(121)])('refuse le titre « %s »', async (title) => {
    expect(await saveMindmap(ID, { title })).toEqual({ error: 'Titre : 1 à 120 caractères.' })
    expect(createClient).not.toHaveBeenCalled()
  })

  it('refuse des nœuds hors liste ou en trop grand nombre', async () => {
    expect(await saveMindmap(ID, { nodes: {} })).toEqual({ error: '1000 éléments au plus.' })
    expect(await saveMindmap(ID, { nodes: items(1001) })).toEqual({ error: '1000 éléments au plus.' })
  })

  it('refuse trop de liens', async () => {
    expect(await saveMindmap(ID, { edges: items(2001) })).toEqual({ error: '2000 liens au plus.' })
  })

  it('refuse sans session', async () => {
    setup({ user: null })
    expect(await saveMindmap(ID, { title: 'x' })).toEqual(SESSION_ERROR)
  })

  it('erreur Supabase : message de réessai', async () => {
    setup({ tables: { 'synapse.mindmaps': { error: boom } } })
    expect(await saveMindmap(ID, { title: 'x' })).toEqual({ error: 'Enregistrement impossible, réessaie.' })
  })

  it('carte introuvable (ou d’un autre compte, masquée par la RLS)', async () => {
    setup({ tables: { 'synapse.mindmaps': { data: [] } } })
    expect(await saveMindmap(ID, { title: 'x' })).toEqual({ error: 'Carte introuvable.' })
  })

  it('n’écrit que les champs fournis, titre rogné', async () => {
    const { calls } = setup({ tables: { 'synapse.mindmaps': { data: [{ id: ID }] } } })
    expect(await saveMindmap(ID, { title: '  Idées  ', nodes: items(2) })).toEqual({})
    expect(calls.find((c) => c.method === 'update')?.args[0]).toEqual({ title: 'Idées', nodes: items(2) })
  })
})
