import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createClient } from '@/lib/supabase/server'
import { dayKey, startOfDay } from '@/lib/time'
import {
  HABITS_MAX,
  STREAK_WINDOW,
  habitsConnector,
  lastDays,
  listHabits,
  moodConnector,
  streakOf,
  toHabits,
} from '@/lib/connectors/mood'
import { mockSupabase, type MockResult } from '@/test/supabase-mock'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))

const NOW = new Date('2026-01-15T10:00:00Z')

/** Les `count` jours se terminant `endOffset` jours avant aujourd'hui (0 = aujourd'hui). */
const daysEnding = (count: number, endOffset = 0) =>
  new Set(Array.from({ length: count }, (_, i) => dayKey(startOfDay(NOW, -(i + endOffset)))))

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

describe('lastDays', () => {
  it('rend les jours du plus ancien à aujourd’hui, à midi UTC', () => {
    expect(lastDays(7, NOW).map((d) => d.key)).toEqual([
      '2026-01-09',
      '2026-01-10',
      '2026-01-11',
      '2026-01-12',
      '2026-01-13',
      '2026-01-14',
      '2026-01-15',
    ])
    expect(lastDays(7, NOW)[0].date).toBe('2026-01-09T12:00:00Z')
  })

  it('ne rend qu’aujourd’hui pour un jour, et prend l’horloge par défaut', () => {
    expect(lastDays(1)).toEqual([{ key: '2026-01-15', date: '2026-01-15T12:00:00Z' }])
  })

  it('traverse un changement d’année', () => {
    expect(lastDays(3, new Date('2026-01-01T10:00:00Z')).map((d) => d.key)).toEqual(['2025-12-30', '2025-12-31', '2026-01-01'])
  })
})

describe('streakOf', () => {
  it('compte depuis aujourd’hui quand il est coché', () => {
    expect(streakOf(new Set(['2026-01-15', '2026-01-14', '2026-01-13']), NOW)).toBe(3)
  })

  it('compte jusqu’à hier quand aujourd’hui n’est pas encore coché', () => {
    expect(streakOf(new Set(['2026-01-14', '2026-01-13']), NOW)).toBe(2)
  })

  it('s’arrête au premier jour manquant', () => {
    expect(streakOf(new Set(['2026-01-15', '2026-01-14', '2026-01-12']), NOW)).toBe(2)
  })

  it('vaut 0 sans jour fait, ou si ni aujourd’hui ni hier ne sont cochés', () => {
    expect(streakOf(new Set(), NOW)).toBe(0)
    expect(streakOf(new Set(['2026-01-13', '2026-01-12']), NOW)).toBe(0)
  })

  it('est plafonnée à la fenêtre lue', () => {
    expect(STREAK_WINDOW).toBe(90)
    expect(streakOf(daysEnding(120), NOW)).toBe(STREAK_WINDOW)
    expect(streakOf(daysEnding(120, 1), NOW)).toBe(STREAK_WINDOW)
    expect(streakOf(daysEnding(89), NOW)).toBe(89)
  })

  it('prend l’horloge du système par défaut', () => {
    expect(streakOf(new Set(['2026-01-15']))).toBe(1)
  })
})

describe('toHabits', () => {
  const habits = [
    { id: 'h1', name: 'Sport' },
    { id: 'h2', name: 'Lire' },
  ]

  it('rend « empty » sans habitude', () => {
    expect(toHabits([], [{ habit_id: 'h1', day: '2026-01-15' }], NOW)).toEqual({ status: 'empty' })
  })

  it('rend, par habitude, le jour fait, l’historique sur 7 jours et la série', () => {
    const result = toHabits(
      habits,
      [
        { habit_id: 'h1', day: '2026-01-15' },
        { habit_id: 'h1', day: '2026-01-14' },
        { habit_id: 'h1', day: '2026-01-13' },
        { habit_id: 'h1', day: '2026-01-01' },
        { habit_id: 'h2', day: '2026-01-13' },
      ],
      NOW,
    )
    if (result.status !== 'ok') throw new Error('attendu : ok')
    const [sport, lire] = result.habits
    expect(sport).toMatchObject({ id: 'h1', name: 'Sport', doneToday: true, streak: 3 })
    expect(sport.days.map((d) => d.done)).toEqual([false, false, false, false, true, true, true])
    expect(sport.days[0]).toEqual({ key: '2026-01-09', date: '2026-01-09T12:00:00Z', done: false })
    expect(lire).toMatchObject({ doneToday: false, streak: 0 })
    expect(lire.days.map((d) => d.done)).toEqual([false, false, false, false, true, false, false])
  })

  it('rend une habitude sans coche, sans série', () => {
    const result = toHabits(habits, [], NOW)
    if (result.status !== 'ok') throw new Error('attendu : ok')
    expect(result.habits.map((h) => [h.doneToday, h.streak])).toEqual([
      [false, 0],
      [false, 0],
    ])
  })
})

describe('moodConnector', () => {
  it('a l’id « mood »', () => {
    expect(moodConnector.id).toBe('mood')
  })

  it('lit depuis le premier jour de l’historique', async () => {
    const m = setup({ mood_entries: { data: [] } })
    await moodConnector.read('u1')
    expect(m.calls).toContainEqual(expect.objectContaining({ table: 'mood_entries', method: 'gte', args: ['day', '2026-01-09'] }))
  })

  it('rend l’humeur du jour et le score de chaque jour', async () => {
    setup({
      mood_entries: {
        data: [
          { day: '2026-01-13', score: 2, note: null },
          { day: '2026-01-15', score: 4, note: 'Bonne journée' },
        ],
      },
    })
    const result = await moodConnector.read('u1')
    expect(result.syncedAt).toBeNull()
    expect(result.data.today).toEqual({ score: 4, note: 'Bonne journée' })
    expect(result.data.days.map((d) => d.score)).toEqual([null, null, null, null, 2, null, 4])
    expect(result.data.days[0].date).toBe('2026-01-09T12:00:00Z')
  })

  it('laisse « today » à null sans saisie du jour', async () => {
    setup({ mood_entries: { data: [{ day: '2026-01-14', score: 3, note: null }] } })
    const result = await moodConnector.read('u1')
    expect(result.data.today).toBeNull()
    expect(result.data.days.at(-2)?.score).toBe(3)
  })

  it('rend « today » null et aucun score sans donnée', async () => {
    setup({ mood_entries: { data: [] } })
    const result = await moodConnector.read('u1')
    expect(result.data.today).toBeNull()
    expect(result.data.days).toHaveLength(7)
    expect(result.data.days.every((d) => d.score === null)).toBe(true)
  })

  it('lève l’erreur Supabase', async () => {
    const error = new Error('mood down')
    setup({ mood_entries: { error } })
    await expect(moodConnector.read('u1')).rejects.toBe(error)
  })
})

describe('habitsConnector', () => {
  it('a l’id « habits »', () => {
    expect(habitsConnector.id).toBe('habits')
  })

  it('rend « empty » sans habitude, sans lire les coches', async () => {
    const m = setup({ habits: { data: [] } })
    expect(await habitsConnector.read('u1')).toEqual({ data: { status: 'empty' }, syncedAt: null })
    expect(m.calls.some((c) => c.table === 'habit_checks')).toBe(false)
  })

  it('rend les habitudes avec leurs coches', async () => {
    setup({
      habits: { data: [{ id: 'h1', name: 'Sport' }] },
      habit_checks: { data: [{ habit_id: 'h1', day: '2026-01-15' }, { habit_id: 'h1', day: '2026-01-14' }] },
    })
    const result = await habitsConnector.read('u1')
    expect(result.syncedAt).toBeNull()
    expect(result.data).toMatchObject({ status: 'ok', habits: [{ id: 'h1', doneToday: true, streak: 2 }] })
  })

  it('ne lit que les habitudes actives, au plus HABITS_MAX', async () => {
    const m = setup({ habits: { data: [] } })
    await habitsConnector.read('u1')
    expect(m.calls).toContainEqual(expect.objectContaining({ table: 'habits', method: 'is', args: ['archived_at', null] }))
    expect(m.calls).toContainEqual(expect.objectContaining({ table: 'habits', method: 'limit', args: [HABITS_MAX] }))
  })

  it('lit les coches de ces habitudes sur la fenêtre de la série', async () => {
    const m = setup({
      habits: { data: [{ id: 'h1', name: 'Sport' }, { id: 'h2', name: 'Lire' }] },
      habit_checks: { data: [] },
    })
    await habitsConnector.read('u1')
    const since = dayKey(startOfDay(NOW, -STREAK_WINDOW))
    expect(m.calls).toContainEqual(expect.objectContaining({ table: 'habit_checks', method: 'in', args: ['habit_id', ['h1', 'h2']] }))
    expect(m.calls).toContainEqual(expect.objectContaining({ table: 'habit_checks', method: 'gte', args: ['day', since] }))
  })

  it('lève l’erreur de lecture des habitudes', async () => {
    const error = new Error('habits down')
    setup({ habits: { error } })
    await expect(habitsConnector.read('u1')).rejects.toBe(error)
  })

  it('lève l’erreur de lecture des coches', async () => {
    const error = new Error('checks down')
    setup({ habits: { data: [{ id: 'h1', name: 'Sport' }] }, habit_checks: { error } })
    await expect(habitsConnector.read('u1')).rejects.toBe(error)
  })
})

describe('listHabits', () => {
  it('rend les habitudes non archivées', async () => {
    const m = setup({ habits: { data: [{ id: 'h1', name: 'Sport' }] } })
    expect(await listHabits()).toEqual([{ id: 'h1', name: 'Sport' }])
    expect(m.calls).toContainEqual(expect.objectContaining({ table: 'habits', method: 'is', args: ['archived_at', null] }))
  })

  it('lève l’erreur Supabase', async () => {
    const error = new Error('habits down')
    setup({ habits: { error } })
    await expect(listHabits()).rejects.toBe(error)
  })
})
