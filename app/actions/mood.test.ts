import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { HABITS_MAX } from '@/lib/connectors/mood'
import { dayKey } from '@/lib/time'
import { mockServerClient, testUser } from '@/test/supabase-mock'
import { expectRedirect, form, throwRedirect } from '@/test/next-mock'
import { addHabit, archiveHabit, saveMoodNote, setHabitDone, setMood } from './mood'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const ID = '11111111-1111-4111-8111-111111111111'
const boom = { message: 'boom' }
const SESSION_ERROR = { error: 'Session expirée, reconnecte-toi.' }
const SAVE_ERROR = { error: 'Enregistrement impossible, réessaie.' }
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

describe('setMood', () => {
  it.each([0, 6, 2.5])('refuse le score %s, avant tout appel', async (score) => {
    expect(await setMood(score)).toEqual({ error: 'Humeur inconnue.' })
    expect(createClient).not.toHaveBeenCalled()
  })

  it('refuse sans session', async () => {
    setup({ user: null })
    expect(await setMood(3)).toEqual(SESSION_ERROR)
  })

  it('erreur Supabase : message de réessai', async () => {
    setup({ tables: { 'synapse.mood_entries': { error: boom } } })
    expect(await setMood(3)).toEqual(SAVE_ERROR)
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('enregistre le score du jour sans toucher à la note', async () => {
    const { calls } = setup({ tables: { 'synapse.mood_entries': { data: null } } })
    expect(await setMood(4)).toEqual({})
    expect(dayKey(NOW)).toBe('2026-01-15')
    expect(calls.find((c) => c.method === 'upsert')?.args[0]).toEqual({ user_id: 'u1', day: '2026-01-15', score: 4 })
    expect(revalidatePath).toHaveBeenCalledWith('/')
  })

  it('le jour suit l’heure de Paris, pas l’UTC', async () => {
    vi.setSystemTime(new Date('2026-01-15T23:30:00Z'))
    const { calls } = setup({ tables: { 'synapse.mood_entries': { data: null } } })
    await setMood(4)
    expect(calls.find((c) => c.method === 'upsert')?.args[0]).toMatchObject({ day: '2026-01-16' })
  })
})

describe('saveMoodNote', () => {
  it('refuse une note de plus de 500 caractères, avant tout appel', async () => {
    expect(await saveMoodNote('x'.repeat(501))).toEqual({ error: '500 caractères au plus.' })
    expect(createClient).not.toHaveBeenCalled()
  })

  it('erreur Supabase : message de réessai', async () => {
    setup({ tables: { 'synapse.mood_entries': { error: boom } } })
    expect(await saveMoodNote('ok')).toEqual(SAVE_ERROR)
  })

  // Pas de lecture de session : la RLS ne laisse voir aucune ligne sans session, comme sans humeur du jour.
  it('refuse sans humeur du jour (ou sans session : aucune ligne visible)', async () => {
    setup({ tables: { 'synapse.mood_entries': { data: [] } } })
    expect(await saveMoodNote('ok')).toEqual({ error: 'Choisis d’abord une humeur.' })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('enregistre la note du jour, rognée', async () => {
    const { calls } = setup({ tables: { 'synapse.mood_entries': { data: [{ day: '2026-01-15' }] } } })
    expect(await saveMoodNote('  bonne journée  ')).toEqual({})
    expect(calls.find((c) => c.method === 'update')?.args[0]).toEqual({ note: 'bonne journée' })
    expect(calls).toContainEqual(expect.objectContaining({ method: 'eq', args: ['day', '2026-01-15'] }))
  })

  it('une note vide l’efface', async () => {
    const { calls } = setup({ tables: { 'synapse.mood_entries': { data: [{ day: '2026-01-15' }] } } })
    expect(await saveMoodNote('   ')).toEqual({})
    expect(calls.find((c) => c.method === 'update')?.args[0]).toEqual({ note: null })
  })
})

describe('setHabitDone', () => {
  it('refuse un id invalide, avant tout appel', async () => {
    expect(await setHabitDone('nope', true)).toEqual({ error: 'Habitude inconnue.' })
    expect(createClient).not.toHaveBeenCalled()
  })

  it('refuse sans session', async () => {
    setup({ user: null })
    expect(await setHabitDone(ID, true)).toEqual(SESSION_ERROR)
  })

  it('coche : upsert du jour pour l’utilisateur', async () => {
    const { calls } = setup({ tables: { 'synapse.habit_checks': { data: null } } })
    expect(await setHabitDone(ID, true)).toEqual({})
    expect(calls.find((c) => c.method === 'upsert')?.args[0]).toEqual({ user_id: 'u1', habit_id: ID, day: '2026-01-15' })
    expect(calls.some((c) => c.method === 'delete')).toBe(false)
    expect(revalidatePath).toHaveBeenCalledWith('/')
  })

  it('décoche : suppression ciblée sur l’habitude et le jour', async () => {
    const { calls } = setup({ tables: { 'synapse.habit_checks': { data: null } } })
    expect(await setHabitDone(ID, false)).toEqual({})
    expect(calls.some((c) => c.method === 'upsert')).toBe(false)
    expect(calls.filter((c) => c.method === 'eq').map((c) => c.args)).toEqual([
      ['habit_id', ID],
      ['day', '2026-01-15'],
    ])
  })

  it.each([true, false])('erreur Supabase (done=%s) : message de réessai', async (done) => {
    setup({ tables: { 'synapse.habit_checks': { error: boom } } })
    expect(await setHabitDone(ID, done)).toEqual(SAVE_ERROR)
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})

describe('addHabit', () => {
  const active = (n: number) => Array.from({ length: n }, (_, i) => ({ position: n - 1 - i }))
  const AT = NOW.getTime()

  it.each([
    ['vide', '', ''],
    ['d’espaces', '   ', ''],
    ['trop long', 'x'.repeat(81), 'x'.repeat(81)],
    ['trop long, entouré d’espaces', ` ${'x'.repeat(81)} `, 'x'.repeat(81)],
  ])('refuse un nom %s, avant tout appel, en le renvoyant sans espaces autour', async (_label, input, name) => {
    expect(await addHabit(null, form({ name: input }))).toEqual({ code: 'name', at: AT, name })
    expect(createClient).not.toHaveBeenCalled()
  })

  it('redirige vers /login sans session', async () => {
    setup({ user: null })
    await expectRedirect(addHabit(null, form({ name: 'Lire' })), '/login')
  })

  it('erreur de lecture : « save » avec le nom saisi', async () => {
    setup({ tables: { 'synapse.habits': { error: boom } } })
    expect(await addHabit(null, form({ name: 'Lire' }))).toEqual({ code: 'save', at: AT, name: 'Lire' })
  })

  it('refuse au-delà du maximum d’habitudes actives, avec le nom saisi', async () => {
    const { calls } = setup({ tables: { 'synapse.habits': { data: active(HABITS_MAX) } } })
    expect(await addHabit(null, form({ name: 'Lire' }))).toEqual({ code: 'max', at: AT, name: 'Lire' })
    expect(calls.some((c) => c.method === 'insert')).toBe(false)
  })

  it('erreur d’insertion : « save » avec le nom saisi', async () => {
    setup({ tables: { 'synapse.habits': [{ data: active(2) }, { error: boom }] } })
    expect(await addHabit(null, form({ name: 'Lire' }))).toEqual({ code: 'save', at: AT, name: 'Lire' })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('ajoute en fin de liste (dernière position + 1), revalide et ne renvoie pas le nom', async () => {
    const { calls } = setup({ tables: { 'synapse.habits': [{ data: active(3) }, { data: null }] } })
    expect(await addHabit(null, form({ name: ' Lire ' }))).toEqual({ code: 'added', at: AT })
    expect(calls.find((c) => c.method === 'insert')?.args[0]).toEqual({ user_id: 'u1', name: 'Lire', position: 3 })
    expect(revalidatePath).toHaveBeenCalledWith('/')
    expect(revalidatePath).toHaveBeenCalledWith('/settings')
  })

  it('première habitude : position 0', async () => {
    const { calls } = setup({ tables: { 'synapse.habits': [{ data: [] }, { data: null }] } })
    expect(await addHabit(null, form({ name: 'Lire' }))).toEqual({ code: 'added', at: AT })
    expect(calls.find((c) => c.method === 'insert')?.args[0]).toMatchObject({ position: 0 })
  })
})

describe('archiveHabit', () => {
  const AT = NOW.getTime()

  it('refuse un id invalide, avant tout appel', async () => {
    expect(await archiveHabit(null, form({ id: 'nope' }))).toEqual({ code: 'save', at: AT })
    expect(createClient).not.toHaveBeenCalled()
  })

  it('erreur Supabase : « save » sans revalider', async () => {
    setup({ tables: { 'synapse.habits': { error: boom } } })
    expect(await archiveHabit(null, form({ id: ID }))).toEqual({ code: 'save', at: AT })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  // Pas de lecture de session : la RLS limite l'écriture aux habitudes de l'utilisateur connecté.
  it('archive l’habitude sans effacer ses jours cochés, puis revalide', async () => {
    const { calls } = setup({ tables: { 'synapse.habits': { data: null } } })
    expect(await archiveHabit(null, form({ id: ID }))).toEqual({ code: 'archived', at: AT })
    expect(calls.find((c) => c.method === 'update')?.args[0]).toEqual({ archived_at: NOW.toISOString() })
    expect(calls.some((c) => c.method === 'delete')).toBe(false)
    expect(revalidatePath).toHaveBeenCalledWith('/')
    expect(revalidatePath).toHaveBeenCalledWith('/settings')
  })
})
