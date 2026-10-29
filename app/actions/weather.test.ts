import { describe, it, expect, vi, beforeEach } from 'vitest'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { searchCities, WEATHER_LOCATIONS_MAX } from '@/lib/connectors/weather'
import { mockServerClient, testUser, type MockResult } from '@/test/supabase-mock'
import { expectRedirect, form, throwRedirect } from '@/test/next-mock'
import { addCity, findCities, moveCity, removeCity } from './weather'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/connectors/weather', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/connectors/weather')>()),
  searchCities: vi.fn(),
}))

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const C = '33333333-3333-4333-8333-333333333333'
const boom = { message: 'boom' }

function setup(opts: Parameters<typeof mockServerClient>[0] = {}) {
  return mockServerClient({ user: testUser(), ...opts })
}

/** Les lectures et écritures de weather_locations passent par le même builder : une liste [lecture, écritures…]. */
const table = (...results: MockResult[]) => ({ tables: { 'synapse.weather_locations': results } })

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(redirect).mockImplementation(throwRedirect)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('addCity', () => {
  const city = { label: 'Paris', latitude: '48.85', longitude: '2.35' }
  const saveCode = { code: 'save' }
  const maxCode = { code: 'max' }

  it.each([
    ['nom vide', { label: '' }],
    ['nom de 81 caractères', { label: 'x'.repeat(81) }],
    ['latitude 91', { latitude: '91' }],
    ['latitude texte', { latitude: 'abc' }],
    ['longitude 181', { longitude: '181' }],
    ['longitude texte', { longitude: 'abc' }],
    ['latitude vide', { latitude: '' }],
    ['longitude vide', { longitude: ' ' }],
  ])('refuse %s, avant tout appel', async (_label, override) => {
    expect(await addCity(null, form({ ...city, ...override }))).toMatchObject({ code: 'invalid' })
    expect(createClient).not.toHaveBeenCalled()
  })

  it('refuse des coordonnées absentes, avant tout appel', async () => {
    expect(await addCity(null, form({ label: 'Paris' }))).toMatchObject({ code: 'invalid' })
    expect(createClient).not.toHaveBeenCalled()
  })

  it('redirige vers /login sans session', async () => {
    const { calls } = setup({ user: null })
    await expectRedirect(addCity(null, form(city)), '/login')
    expect(calls.some((c) => c.method === 'insert')).toBe(false)
  })

  it('erreur de lecture : code save', async () => {
    setup(table({ error: boom }))
    expect(await addCity(null, form(city))).toMatchObject(saveCode)
  })

  it('refuse au-delà du nombre maximal de villes, sans insertion', async () => {
    const { calls } = setup(table({ data: Array.from({ length: WEATHER_LOCATIONS_MAX }, (_, i) => ({ position: i })) }))
    expect(await addCity(null, form(city))).toMatchObject(maxCode)
    expect(calls.some((c) => c.method === 'insert')).toBe(false)
  })

  it('erreur d’insertion : code save', async () => {
    setup(table({ data: [] }, { error: boom }))
    expect(await addCity(null, form(city))).toMatchObject(saveCode)
  })

  it('limite refusée par la base (ajouts simultanés) : code max', async () => {
    setup(table({ data: [{ position: 3 }] }, { error: { message: 'weather_locations_max' } }))
    expect(await addCity(null, form(city))).toMatchObject(maxCode)
  })

  it('ajoute la ville nettoyée en dernière position, revalide / et /settings et ne redirige pas', async () => {
    const { calls } = setup(table({ data: [{ position: 4 }] }, { data: null }))
    expect(await addCity(null, form({ ...city, label: ' Paris ' }))).toMatchObject({ code: 'added' })
    expect(calls.find((c) => c.method === 'insert')?.args[0]).toEqual({
      label: 'Paris',
      latitude: 48.85,
      longitude: 2.35,
      position: 5,
    })
    expect(revalidatePath).toHaveBeenCalledWith('/')
    expect(revalidatePath).toHaveBeenCalledWith('/settings')
    expect(redirect).not.toHaveBeenCalled()
  })

  it('première ville : position 0', async () => {
    const { calls } = setup(table({ data: [] }, { data: null }))
    expect(await addCity(null, form(city))).toMatchObject({ code: 'added' })
    expect(calls.find((c) => c.method === 'insert')?.args[0]).toMatchObject({ position: 0 })
  })
})

describe('findCities', () => {
  const found = [{ label: 'Strasbourg', detail: 'Grand Est, France', latitude: 48.58, longitude: 7.75 }]

  it.each([
    ['vide', ''],
    ['1 caractère', ' a '],
    ['81 caractères', 'x'.repeat(81)],
    ['pas une chaîne', 42 as unknown as string],
  ])('requête %s : aucun résultat, avant tout appel', async (_label, query) => {
    expect(await findCities(query)).toEqual({ results: [] })
    expect(createClient).not.toHaveBeenCalled()
    expect(searchCities).not.toHaveBeenCalled()
  })

  it('sans session : erreur, sans appel au géocodage', async () => {
    setup({ user: null })
    expect(await findCities('Stras')).toEqual({ error: 'Session expirée, reconnecte-toi.' })
    expect(searchCities).not.toHaveBeenCalled()
    expect(redirect).not.toHaveBeenCalled()
  })

  it('trop de recherches : erreur, sans appel au géocodage au-delà de la limite', async () => {
    setup({ user: testUser('limite@x.fr', 'u-limite') })
    vi.mocked(searchCities).mockResolvedValue(found)
    const answers = []
    for (let i = 0; i < 61; i++) answers.push(await findCities('Stras'))
    expect(answers.slice(0, 60).every((a) => a.results)).toBe(true)
    expect(answers[60]).toEqual({ error: 'Trop de recherches, réessaie dans un instant.' })
    expect(searchCities).toHaveBeenCalledTimes(60)
  })

  it('géocodage en échec : erreur affichable', async () => {
    setup()
    vi.mocked(searchCities).mockRejectedValue(new Error('HTTP 500'))
    expect(await findCities('Stras')).toEqual({ error: 'Recherche impossible : Open-Meteo ne répond pas.' })
  })

  it('renvoie les résultats, requête nettoyée', async () => {
    setup()
    vi.mocked(searchCities).mockResolvedValue(found)
    expect(await findCities('  Stras ')).toEqual({ results: found })
    expect(searchCities).toHaveBeenCalledWith('Stras')
  })
})

describe('removeCity', () => {
  it('refuse un id invalide, avant tout appel', async () => {
    expect(await removeCity(null, form({ id: 'nope' }))).toMatchObject({ code: 'invalid' })
    expect(createClient).not.toHaveBeenCalled()
  })

  it('redirige vers /login sans session', async () => {
    setup({ user: null })
    await expectRedirect(removeCity(null, form({ id: A })), '/login')
  })

  it('erreur Supabase : code save', async () => {
    setup(table({ error: boom }))
    expect(await removeCity(null, form({ id: A }))).toMatchObject({ code: 'save' })
  })

  it('retire la ville et revalide / et /settings', async () => {
    const { calls } = setup(table({ data: null }))
    expect(await removeCity(null, form({ id: A }))).toMatchObject({ code: 'removed' })
    expect(calls).toContainEqual(expect.objectContaining({ method: 'eq', args: ['id', A] }))
    expect(revalidatePath).toHaveBeenCalledWith('/')
    expect(revalidatePath).toHaveBeenCalledWith('/settings')
    expect(redirect).not.toHaveBeenCalled()
  })
})

describe('moveCity', () => {
  const ids = [A, B, C].map((id) => ({ id }))
  const positions = (calls: ReturnType<typeof mockServerClient>['calls']) =>
    calls.filter((c) => c.method === 'update').map((c) => c.args[0])
  const targets = (calls: ReturnType<typeof mockServerClient>['calls']) =>
    calls.filter((c) => c.method === 'eq').map((c) => c.args[1])

  it.each([
    ['direction 0', { id: A, direction: '0' }],
    ['direction 2', { id: A, direction: '2' }],
    ['id invalide', { id: 'nope', direction: '1' }],
  ])('refuse %s, avant tout appel', async (_label, fields) => {
    expect(await moveCity(null, form(fields))).toMatchObject({ code: 'invalid' })
    expect(createClient).not.toHaveBeenCalled()
  })

  it('erreur de lecture : code save', async () => {
    setup(table({ error: boom }))
    expect(await moveCity(null, form({ id: A, direction: '1' }))).toMatchObject({ code: 'save' })
  })

  it.each([
    ['id absent', { id: '44444444-4444-4444-8444-444444444444', direction: '1' }],
    ['monter la première', { id: A, direction: '-1' }],
    ['descendre la dernière', { id: C, direction: '1' }],
  ])('%s : rien à faire, aucune mise à jour', async (_label, fields) => {
    const { calls } = setup(table({ data: ids }))
    expect(await moveCity(null, form(fields))).toMatchObject({ code: 'moved' })
    expect(positions(calls)).toEqual([])
  })

  it('descend une ville : renumérote tout avec les ids échangés', async () => {
    const { calls } = setup(table({ data: ids }, { data: null }))
    expect(await moveCity(null, form({ id: A, direction: '1' }))).toMatchObject({ code: 'moved' })
    expect(positions(calls)).toEqual([{ position: 0 }, { position: 1 }, { position: 2 }])
    expect(targets(calls)).toEqual([B, A, C])
  })

  it('monte une ville', async () => {
    const { calls } = setup(table({ data: ids }, { data: null }))
    expect(await moveCity(null, form({ id: C, direction: '-1' }))).toMatchObject({ code: 'moved' })
    expect(targets(calls)).toEqual([A, C, B])
  })

  it('une mise à jour en erreur : code save', async () => {
    setup(table({ data: ids }, { data: null }, { error: boom }, { data: null }))
    expect(await moveCity(null, form({ id: A, direction: '1' }))).toMatchObject({ code: 'save' })
  })
})
