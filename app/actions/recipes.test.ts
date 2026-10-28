import { describe, it, expect, vi, beforeEach } from 'vitest'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { readShoppingChecklistId } from '@/lib/connectors/cairn'
import { MEALDB_IMPORT_MAX, fetchMealDb } from '@/lib/mealdb'
import { mockServerClient, testUser } from '@/test/supabase-mock'
import { expectRedirect, form, throwRedirect } from '@/test/next-mock'
import { addIngredientsToShopping, deleteRecipe, importFromMealDb, saveRecipe } from './recipes'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/connectors/cairn', () => ({ readShoppingChecklistId: vi.fn() }))
vi.mock('@/lib/mealdb', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/mealdb')>()),
  fetchMealDb: vi.fn(),
}))

const ID = '11111111-1111-4111-8111-111111111111'
const NOTE = '22222222-2222-4222-8222-222222222222'
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

describe('saveRecipe', () => {
  const fields = { title: 'Crêpes', ingredients: 'farine\n\n  œufs  \nlait', steps: 'mélanger\ncuire' }

  it('refuse un id invalide, avant tout appel', async () => {
    await expectRedirect(saveRecipe(form({ ...fields, id: 'nope' })), '/recipes?error=unknown')
    expect(createClient).not.toHaveBeenCalled()
  })

  it.each([
    ['création', '', '/recipes/new'],
    ['modification', ID, `/recipes/${ID}/edit`],
  ])('%s : le retour d’erreur vise le bon formulaire', async (_label, id, back) => {
    await expectRedirect(saveRecipe(form({ ...fields, id, title: '' })), `${back}?error=title`)
    await expectRedirect(saveRecipe(form({ ...fields, id, title: 'x'.repeat(201) })), `${back}?error=title`)
    expect(createClient).not.toHaveBeenCalled()
  })

  it('refuse trop de lignes ou une ligne trop longue', async () => {
    await expectRedirect(saveRecipe(form({ ...fields, ingredients: Array(101).fill('a').join('\n') })), '/recipes/new?error=too-long')
    await expectRedirect(saveRecipe(form({ ...fields, ingredients: 'a'.repeat(201) })), '/recipes/new?error=too-long')
    await expectRedirect(saveRecipe(form({ ...fields, steps: 'a'.repeat(2001) })), '/recipes/new?error=too-long')
    expect(createClient).not.toHaveBeenCalled()
  })

  it.each(['ftp://x', 'javascript:alert(1)', 'http://'])('refuse l’adresse source « %s »', async (source_url) => {
    await expectRedirect(saveRecipe(form({ ...fields, source_url })), '/recipes/new?error=url')
    expect(createClient).not.toHaveBeenCalled()
  })

  it('redirige vers /login sans session', async () => {
    setup({ user: null })
    await expectRedirect(saveRecipe(form(fields)), '/login')
  })

  it('erreur Supabase : retour au formulaire d’édition avec ?error=save', async () => {
    setup({ tables: { 'synapse.recipes': { error: boom } } })
    await expectRedirect(saveRecipe(form({ ...fields, id: ID })), `/recipes/${ID}/edit?error=save`)
  })

  it('modification d’une recette introuvable (ou d’un autre compte) : ?error=unknown', async () => {
    setup({ tables: { 'synapse.recipes': { data: null } } })
    await expectRedirect(saveRecipe(form({ ...fields, id: ID })), '/recipes?error=unknown')
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('création : une entrée par ligne non vide, rattachée à l’utilisateur', async () => {
    const { calls } = setup({ tables: { 'synapse.recipes': { data: { id: ID } } } })
    await expectRedirect(saveRecipe(form({ ...fields, source_url: 'https://exemple.fr/crepes' })), `/recipes/${ID}`)
    expect(calls.find((c) => c.method === 'insert')?.args[0]).toEqual({
      title: 'Crêpes',
      ingredients: ['farine', 'œufs', 'lait'],
      steps: ['mélanger', 'cuire'],
      source_url: 'https://exemple.fr/crepes',
      user_id: 'u1',
    })
    expect(revalidatePath).toHaveBeenCalledWith('/recipes')
  })

  it('modification : met à jour sans user_id', async () => {
    const { calls } = setup({ tables: { 'synapse.recipes': { data: { id: ID } } } })
    await expectRedirect(saveRecipe(form({ ...fields, id: ID })), `/recipes/${ID}`)
    expect(calls.find((c) => c.method === 'update')?.args[0]).not.toHaveProperty('user_id')
    expect(calls.some((c) => c.method === 'insert')).toBe(false)
  })
})

describe('deleteRecipe', () => {
  it('refuse un id invalide, avant tout appel', async () => {
    await expectRedirect(deleteRecipe(form({ id: 'nope' })), '/recipes?error=unknown')
    expect(createClient).not.toHaveBeenCalled()
  })

  it('erreur Supabase : retour à la fiche avec ?error=delete', async () => {
    setup({ tables: { 'synapse.recipes': { error: boom } } })
    await expectRedirect(deleteRecipe(form({ id: ID })), `/recipes/${ID}?error=delete`)
  })

  // Pas de lecture de session : la RLS ne laisse supprimer que les recettes de l'utilisateur connecté.
  it('supprime la recette', async () => {
    const { calls } = setup({ tables: { 'synapse.recipes': { data: null } } })
    await expectRedirect(deleteRecipe(form({ id: ID })), '/recipes?deleted=1')
    expect(calls).toContainEqual(expect.objectContaining({ method: 'eq', args: ['id', ID] }))
  })
})

describe('importFromMealDb', () => {
  const meal = (n: number) => ({ title: `Recette ${n}`, mealdb_id: String(n), ingredients: ['a'], steps: ['b'] })

  it('redirige vers /login sans session, sans appeler TheMealDB', async () => {
    setup({ user: null })
    await expectRedirect(importFromMealDb(form({ query: 'pasta', count: '3' })), '/login')
    expect(fetchMealDb).not.toHaveBeenCalled()
  })

  it('TheMealDB en erreur : ?error=mealdb', async () => {
    setup()
    vi.mocked(fetchMealDb).mockRejectedValue(new Error('réseau'))
    await expectRedirect(importFromMealDb(form({ query: 'pasta', count: '3' })), '/recipes?error=mealdb')
  })

  it('aucun résultat : ?imported=0', async () => {
    const { calls } = setup()
    vi.mocked(fetchMealDb).mockResolvedValue([])
    await expectRedirect(importFromMealDb(form({ query: 'zzz', count: '3' })), '/recipes?imported=0')
    expect(calls).toEqual([])
  })

  it.each([
    ['99', MEALDB_IMPORT_MAX],
    ['0', 1],
    ['-4', 1],
    ['', 5],
    ['abc', 5],
    ['3', 3],
  ])('nombre demandé « %s » : TheMealDB reçoit %s', async (count, expected) => {
    setup()
    vi.mocked(fetchMealDb).mockResolvedValue([])
    await expectRedirect(importFromMealDb(form({ query: ' pasta ', count })), '/recipes?imported=0')
    expect(fetchMealDb).toHaveBeenCalledWith('pasta', expected)
  })

  it('erreur à l’enregistrement : ?error=save', async () => {
    setup({ tables: { 'synapse.recipes': { error: boom } } })
    vi.mocked(fetchMealDb).mockResolvedValue([meal(1)] as never)
    await expectRedirect(importFromMealDb(form({ query: 'pasta', count: '1' })), '/recipes?error=save')
  })

  it('compte les recettes importées et celles déjà connues', async () => {
    const { calls } = setup({ tables: { 'synapse.recipes': { data: [{ id: 'a' }, { id: 'b' }] } } })
    vi.mocked(fetchMealDb).mockResolvedValue([meal(1), meal(2), meal(3)] as never)
    await expectRedirect(importFromMealDb(form({ query: 'pasta', count: '3' })), '/recipes?imported=2&skipped=1')
    const rows = calls.find((c) => c.method === 'upsert')?.args[0] as { user_id: string }[]
    expect(rows.map((r) => r.user_id)).toEqual(['u1', 'u1', 'u1'])
  })
})

describe('addIngredientsToShopping', () => {
  const full = (overrides: Record<string, unknown> = {}) =>
    setup({
      tables: {
        'synapse.recipes': { data: { ingredients: ['farine', 'œufs'] } },
        notes: { data: { id: NOTE } },
        checklist_items: [{ data: { position: 7 } }, { data: null }],
        ...overrides,
      },
    })

  beforeEach(() => {
    vi.mocked(readShoppingChecklistId).mockResolvedValue(NOTE)
  })

  it('refuse un id invalide, avant tout appel', async () => {
    expect(await addIngredientsToShopping('nope')).toEqual({ error: 'Recette inconnue.' })
    expect(createClient).not.toHaveBeenCalled()
  })

  it('refuse sans session', async () => {
    setup({ user: null })
    expect(await addIngredientsToShopping(ID)).toEqual(SESSION_ERROR)
  })

  it('erreur de lecture de la recette', async () => {
    full({ 'synapse.recipes': { error: boom } })
    expect(await addIngredientsToShopping(ID)).toEqual({ error: 'Impossible de lire la recette.' })
  })

  it('recette introuvable', async () => {
    full({ 'synapse.recipes': { data: null } })
    expect(await addIngredientsToShopping(ID)).toEqual({ error: 'Recette introuvable.' })
  })

  it('recette sans ingrédients', async () => {
    full({ 'synapse.recipes': { data: { ingredients: [] } } })
    expect(await addIngredientsToShopping(ID)).toEqual({ error: 'Cette recette n’a pas d’ingrédients.' })
  })

  it('aucune checklist des courses choisie', async () => {
    full()
    vi.mocked(readShoppingChecklistId).mockResolvedValue(null)
    expect(await addIngredientsToShopping(ID)).toEqual({ error: 'Aucune checklist des courses choisie dans les réglages.' })
  })

  it.each([
    ['la note', { notes: { error: boom } }],
    ['les items', { checklist_items: { error: boom } }],
  ])('erreur de lecture de %s', async (_label, overrides) => {
    full(overrides)
    expect(await addIngredientsToShopping(ID)).toEqual({ error: 'Impossible de lire la liste de courses.' })
  })

  it('checklist introuvable, passée au coffre ou supprimée', async () => {
    full({ notes: { data: null } })
    expect(await addIngredientsToShopping(ID)).toEqual({
      error: 'La checklist des courses est introuvable ou passée au coffre.',
    })
  })

  it('erreur d’écriture dans Cairn', async () => {
    full({ checklist_items: [{ data: { position: 7 } }, { error: boom }] })
    expect(await addIngredientsToShopping(ID)).toEqual({ error: 'Impossible d’écrire dans Cairn.' })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('ajoute un item par ingrédient après la dernière position', async () => {
    const { calls } = full()
    expect(await addIngredientsToShopping(ID)).toEqual({ added: 2 })
    expect(calls.find((c) => c.table === 'checklist_items' && c.method === 'insert')?.args[0]).toEqual([
      { note_id: NOTE, user_id: 'u1', content: 'farine', position: 8 },
      { note_id: NOTE, user_id: 'u1', content: 'œufs', position: 9 },
    ])
    expect(revalidatePath).toHaveBeenCalledWith('/')
  })

  it('liste vide : commence à la position 0', async () => {
    const { calls } = full({ checklist_items: [{ data: null }, { data: null }] })
    expect(await addIngredientsToShopping(ID)).toEqual({ added: 2 })
    const rows = calls.find((c) => c.table === 'checklist_items' && c.method === 'insert')?.args[0] as { position: number }[]
    expect(rows.map((r) => r.position)).toEqual([0, 1])
  })
})
