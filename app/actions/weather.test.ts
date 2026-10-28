import { describe, it, expect, vi, beforeEach } from 'vitest'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { WEATHER_LOCATIONS_MAX } from '@/lib/connectors/weather'
import { mockServerClient, testUser, type MockResult } from '@/test/supabase-mock'
import { expectRedirect, form, throwRedirect } from '@/test/next-mock'
import { addCity, moveCity, removeCity } from './weather'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const C = '33333333-3333-4333-8333-333333333333'
const boom = { message: 'boom' }
const to = (code: string) => `/settings?weather=${code}`

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

  it.each([
    ['nom vide', { label: '' }],
    ['nom de 81 caractères', { label: 'x'.repeat(81) }],
    ['latitude 91', { latitude: '91' }],
    ['latitude non numérique', { latitude: 'abc' }],
    ['longitude 181', { longitude: '181' }],
    ['longitude non numérique', { longitude: 'abc' }],
  ])('refuse %s, avant tout appel', async (_label, override) => {
    await expectRedirect(addCity(form({ ...city, ...override })), to('invalid'))
    expect(createClient).not.toHaveBeenCalled()
  })

  it('redirige vers /login sans session', async () => {
    setup({ user: null })
    await expectRedirect(addCity(form(city)), '/login')
  })

  it('erreur de lecture : ?weather=save', async () => {
    setup(table({ error: boom }))
    await expectRedirect(addCity(form(city)), to('save'))
  })

  it('refuse au-delà du nombre maximal de villes', async () => {
    const { calls } = setup(table({ data: Array.from({ length: WEATHER_LOCATIONS_MAX }, (_, i) => ({ position: i })) }))
    await expectRedirect(addCity(form(city)), to('max'))
    expect(calls.some((c) => c.method === 'insert')).toBe(false)
  })

  it('erreur d’insertion : ?weather=save', async () => {
    setup(table({ data: [] }, { error: boom }))
    await expectRedirect(addCity(form(city)), to('save'))
  })

  it('ajoute la ville en dernière position et revalide', async () => {
    const { calls } = setup(table({ data: [{ position: 4 }] }, { data: null }))
    await expectRedirect(addCity(form(city)), to('added'))
    expect(calls.find((c) => c.method === 'insert')?.args[0]).toEqual({
      label: 'Paris',
      latitude: 48.85,
      longitude: 2.35,
      position: 5,
    })
    expect(revalidatePath).toHaveBeenCalledWith('/')
  })

  it('première ville : position 0', async () => {
    const { calls } = setup(table({ data: [] }, { data: null }))
    await expectRedirect(addCity(form(city)), to('added'))
    expect(calls.find((c) => c.method === 'insert')?.args[0]).toMatchObject({ position: 0 })
  })
})

describe('removeCity', () => {
  it('refuse un id invalide, avant tout appel', async () => {
    await expectRedirect(removeCity(form({ id: 'nope' })), to('invalid'))
    expect(createClient).not.toHaveBeenCalled()
  })

  it('redirige vers /login sans session', async () => {
    setup({ user: null })
    await expectRedirect(removeCity(form({ id: A })), '/login')
  })

  it('erreur Supabase : ?weather=save', async () => {
    setup(table({ error: boom }))
    await expectRedirect(removeCity(form({ id: A })), to('save'))
  })

  it('retire la ville', async () => {
    const { calls } = setup(table({ data: null }))
    await expectRedirect(removeCity(form({ id: A })), to('removed'))
    expect(calls).toContainEqual(expect.objectContaining({ method: 'eq', args: ['id', A] }))
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
    await expectRedirect(moveCity(form(fields)), to('invalid'))
    expect(createClient).not.toHaveBeenCalled()
  })

  it('erreur de lecture : ?weather=save', async () => {
    setup(table({ error: boom }))
    await expectRedirect(moveCity(form({ id: A, direction: '1' })), to('save'))
  })

  it.each([
    ['id absent', { id: '44444444-4444-4444-8444-444444444444', direction: '1' }],
    ['monter la première', { id: A, direction: '-1' }],
    ['descendre la dernière', { id: C, direction: '1' }],
  ])('%s : rien à faire, aucune mise à jour', async (_label, fields) => {
    const { calls } = setup(table({ data: ids }))
    await expectRedirect(moveCity(form(fields)), to('moved'))
    expect(positions(calls)).toEqual([])
  })

  it('descend une ville : renumérote tout avec les ids échangés', async () => {
    const { calls } = setup(table({ data: ids }, { data: null }))
    await expectRedirect(moveCity(form({ id: A, direction: '1' })), to('moved'))
    expect(positions(calls)).toEqual([{ position: 0 }, { position: 1 }, { position: 2 }])
    expect(targets(calls)).toEqual([B, A, C])
  })

  it('monte une ville', async () => {
    const { calls } = setup(table({ data: ids }, { data: null }))
    await expectRedirect(moveCity(form({ id: C, direction: '-1' })), to('moved'))
    expect(targets(calls)).toEqual([A, C, B])
  })

  it('une mise à jour en erreur : ?weather=save', async () => {
    setup(table({ data: ids }, { data: null }, { error: boom }, { data: null }))
    await expectRedirect(moveCity(form({ id: A, direction: '1' })), to('save'))
  })
})
