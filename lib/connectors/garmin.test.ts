import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createClient } from '@/lib/supabase/server'
import { activitiesConnector, activityLabel, sleepConnector, toNight, toTrend, trendConnector } from '@/lib/connectors/garmin'
import { mockSupabase, type MockResult } from '@/test/supabase-mock'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))

type Daily = Parameters<typeof toNight>[0]
type TrendRow = Parameters<typeof toTrend>[0][number]

const NOW = new Date('2026-01-15T10:00:00Z')
const FINISHED = '2026-01-15T09:00:00Z'

const daily = (over: Partial<Daily> = {}): Daily =>
  ({
    day: '2026-01-15',
    sleep_start_at: '2026-01-14T22:30:00Z',
    sleep_end_at: '2026-01-15T06:30:00Z',
    sleep_seconds: 28_800,
    deep_sleep_seconds: 5_400,
    light_sleep_seconds: 16_200,
    rem_sleep_seconds: 5_400,
    awake_seconds: 1_800,
    sleep_score: 82,
    body_battery_charged: 60,
    body_battery_at_wake: 85,
    ...over,
  }) as Daily

const trendRow = (day: string, over: Partial<TrendRow> = {}): TrendRow => ({
  day,
  steps: null,
  steps_goal: null,
  resting_hr: null,
  ...over,
})

function setup(tables: Record<string, MockResult | MockResult[]>) {
  const m = mockSupabase({ tables })
  vi.mocked(createClient).mockResolvedValue(m.client as never)
  return m
}

// Chaque connecteur lit aussi `sync_runs` : on le configure toujours.
const SYNCED = { sync_runs: { data: { finished_at: FINISHED } } }

beforeEach(() => {
  vi.mocked(createClient).mockReset()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('activityLabel', () => {
  it('rend null sans type', () => {
    expect(activityLabel(null)).toBeNull()
    expect(activityLabel('')).toBeNull()
  })

  it('traduit un type connu', () => {
    expect(activityLabel('running')).toBe('Course à pied')
    expect(activityLabel('cross_country_skiing_ws')).toBe('Ski de fond')
  })

  it('met en forme un type inconnu', () => {
    expect(activityLabel('stand_up_paddle')).toBe('Stand up paddle')
  })
})

describe('toNight', () => {
  it('rend null sans sommeil mesuré', () => {
    expect(toNight(daily({ sleep_seconds: null }), NOW)).toBeNull()
    expect(toNight(daily({ sleep_seconds: 0 }), NOW)).toBeNull()
    expect(toNight(daily({ sleep_seconds: -10 }), NOW)).toBeNull()
  })

  it('reprend les champs de la ligne', () => {
    expect(toNight(daily(), NOW)).toEqual({
      day: '2026-01-15',
      isToday: true,
      sleepStartAt: '2026-01-14T22:30:00Z',
      sleepEndAt: '2026-01-15T06:30:00Z',
      sleepSeconds: 28_800,
      deepSeconds: 5_400,
      lightSeconds: 16_200,
      remSeconds: 5_400,
      awakeSeconds: 1_800,
      score: 82,
      bodyBatteryCharged: 60,
      bodyBatteryAtWake: 85,
    })
  })

  it('marque « aujourd’hui » seulement la nuit du jour', () => {
    expect(toNight(daily({ day: '2026-01-15' }), NOW)?.isToday).toBe(true)
    expect(toNight(daily({ day: '2026-01-14' }), NOW)?.isToday).toBe(false)
  })

  it('prend l’horloge du système par défaut', () => {
    expect(toNight(daily())?.isToday).toBe(true)
  })
})

describe('toTrend', () => {
  it('couvre les 7 derniers jours, aujourd’hui compris, du plus ancien au plus récent', () => {
    const { days } = toTrend([], NOW)
    expect(days.map((d) => d.key)).toEqual([
      '2026-01-09',
      '2026-01-10',
      '2026-01-11',
      '2026-01-12',
      '2026-01-13',
      '2026-01-14',
      '2026-01-15',
    ])
    expect(days[0].date).toBe('2026-01-09T12:00:00Z')
  })

  it('laisse vide un jour sans ligne', () => {
    const { days } = toTrend([trendRow('2026-01-15', { steps: 8000, resting_hr: 50 })], NOW)
    expect(days.at(-1)).toMatchObject({ steps: 8000, restingHr: 50 })
    expect(days[0]).toMatchObject({ steps: null, restingHr: null })
  })

  it('arrondit les moyennes sur les jours connus', () => {
    const trend = toTrend(
      [trendRow('2026-01-15', { steps: 8001, resting_hr: 50 }), trendRow('2026-01-13', { steps: 6000, resting_hr: 53 })],
      NOW,
    )
    expect(trend).toMatchObject({ status: 'ok', avgSteps: 7001, avgRestingHr: 52 })
  })

  it('prend l’objectif de la ligne la plus récente qui en a un', () => {
    const trend = toTrend(
      [
        trendRow('2026-01-13', { steps: 6000, steps_goal: 9000 }),
        trendRow('2026-01-14', { steps: 7000, steps_goal: 9500 }),
        trendRow('2026-01-15', { steps: 8000, steps_goal: null }),
      ],
      NOW,
    )
    expect(trend.stepsGoal).toBe(9500)
  })

  it('est « empty » sans donnée', () => {
    expect(toTrend([], NOW)).toMatchObject({ status: 'empty', stepsGoal: null, avgSteps: null, avgRestingHr: null })
  })

  it('est « empty » quand les lignes sont hors de la semaine', () => {
    expect(toTrend([trendRow('2026-01-01', { steps: 5000 })], NOW).status).toBe('empty')
  })
})

describe('sleepConnector', () => {
  it('a l’id « garmin »', () => {
    expect(sleepConnector.id).toBe('garmin')
  })

  it('rend la dernière nuit et la date de la dernière synchro', async () => {
    const m = setup({ garmin_daily: { data: daily() }, ...SYNCED })
    const result = await sleepConnector.read('u1')
    expect(result.data).toMatchObject({ status: 'ok', night: { day: '2026-01-15', isToday: true, sleepSeconds: 28_800 } })
    expect(result.syncedAt).toEqual(new Date(FINISHED))
    expect(m.calls).toContainEqual(expect.objectContaining({ table: 'garmin_daily', method: 'gt', args: ['sleep_seconds', 0] }))
  })

  it('lit les synchros Garmin réussies', async () => {
    const m = setup({ garmin_daily: { data: daily() }, ...SYNCED })
    await sleepConnector.read('u1')
    const filters = m.calls.filter((c) => c.table === 'sync_runs' && c.method === 'eq').map((c) => c.args)
    expect(filters).toEqual([
      ['source', 'garmin'],
      ['status', 'success'],
    ])
  })

  it('rend « empty » sans nuit', async () => {
    setup({ garmin_daily: { data: null }, ...SYNCED })
    const result = await sleepConnector.read('u1')
    expect(result.data).toEqual({ status: 'empty' })
    expect(result.syncedAt).toEqual(new Date(FINISHED))
  })

  it('a une date de synchro null sans synchro réussie', async () => {
    setup({ garmin_daily: { data: daily() }, sync_runs: { data: null } })
    expect((await sleepConnector.read('u1')).syncedAt).toBeNull()
    setup({ garmin_daily: { data: daily() }, sync_runs: { data: { finished_at: null } } })
    expect((await sleepConnector.read('u1')).syncedAt).toBeNull()
  })

  it('lève l’erreur de garmin_daily', async () => {
    const error = new Error('daily down')
    setup({ garmin_daily: { error }, ...SYNCED })
    await expect(sleepConnector.read('u1')).rejects.toBe(error)
  })

  it('lève l’erreur de sync_runs', async () => {
    const error = new Error('runs down')
    setup({ garmin_daily: { data: daily() }, sync_runs: { error } })
    await expect(sleepConnector.read('u1')).rejects.toBe(error)
  })
})

describe('activitiesConnector', () => {
  const activity = (over: Record<string, unknown> = {}) => ({
    activity_id: 1,
    name: 'Sortie du matin',
    activity_type: 'running',
    start_at: '2026-01-15T07:00:00Z',
    duration_seconds: 3600,
    distance_meters: 10_000,
    avg_hr: 150,
    elevation_gain_meters: 80,
    ...over,
  })

  it('a l’id « garmin »', () => {
    expect(activitiesConnector.id).toBe('garmin')
  })

  it('rend les activités avec leur type traduit', async () => {
    setup({ garmin_activities: { data: [activity()] }, ...SYNCED })
    const result = await activitiesConnector.read('u1')
    expect(result.syncedAt).toEqual(new Date(FINISHED))
    expect(result.data).toEqual({
      status: 'ok',
      activities: [
        {
          id: 1,
          title: 'Sortie du matin',
          type: 'Course à pied',
          startAt: '2026-01-15T07:00:00Z',
          durationSeconds: 3600,
          distanceMeters: 10_000,
          avgHr: 150,
          elevationGainMeters: 80,
        },
      ],
    })
  })

  it('prend le libellé du type, puis « Activité », quand le nom manque', async () => {
    setup({
      garmin_activities: {
        data: [
          activity({ activity_id: 1, name: null }),
          activity({ activity_id: 2, name: '   ', activity_type: 'yoga' }),
          activity({ activity_id: 3, name: null, activity_type: null }),
        ],
      },
      ...SYNCED,
    })
    const result = await activitiesConnector.read('u1')
    if (result.data.status !== 'ok') throw new Error('attendu : ok')
    expect(result.data.activities.map((a) => [a.title, a.type])).toEqual([
      ['Course à pied', 'Course à pied'],
      ['Yoga', 'Yoga'],
      ['Activité', null],
    ])
  })

  it('rend « empty » sans activité', async () => {
    setup({ garmin_activities: { data: [] }, ...SYNCED })
    expect((await activitiesConnector.read('u1')).data).toEqual({ status: 'empty' })
  })

  it('lève l’erreur de garmin_activities', async () => {
    const error = new Error('activities down')
    setup({ garmin_activities: { error }, ...SYNCED })
    await expect(activitiesConnector.read('u1')).rejects.toBe(error)
  })

  it('lève l’erreur de sync_runs', async () => {
    const error = new Error('runs down')
    setup({ garmin_activities: { data: [activity()] }, sync_runs: { error } })
    await expect(activitiesConnector.read('u1')).rejects.toBe(error)
  })
})

describe('trendConnector', () => {
  it('a l’id « garmin »', () => {
    expect(trendConnector.id).toBe('garmin')
  })

  it('lit depuis le premier jour de la semaine', async () => {
    const m = setup({ garmin_daily: { data: [] }, ...SYNCED })
    await trendConnector.read('u1')
    expect(m.calls).toContainEqual(expect.objectContaining({ table: 'garmin_daily', method: 'gte', args: ['day', '2026-01-09'] }))
  })

  it('rend la tendance et la date de synchro', async () => {
    setup({
      garmin_daily: { data: [trendRow('2026-01-15', { steps: 8000, steps_goal: 10_000, resting_hr: 50 })] },
      ...SYNCED,
    })
    const result = await trendConnector.read('u1')
    expect(result.data).toMatchObject({ status: 'ok', stepsGoal: 10_000, avgSteps: 8000, avgRestingHr: 50 })
    expect(result.data.days).toHaveLength(7)
    expect(result.syncedAt).toEqual(new Date(FINISHED))
  })

  it('rend « empty » sans donnée', async () => {
    setup({ garmin_daily: { data: [] }, ...SYNCED })
    expect((await trendConnector.read('u1')).data.status).toBe('empty')
  })

  it('lève l’erreur de garmin_daily', async () => {
    const error = new Error('daily down')
    setup({ garmin_daily: { error }, ...SYNCED })
    await expect(trendConnector.read('u1')).rejects.toBe(error)
  })

  it('lève l’erreur de sync_runs', async () => {
    const error = new Error('runs down')
    setup({ garmin_daily: { data: [] }, sync_runs: { error } })
    await expect(trendConnector.read('u1')).rejects.toBe(error)
  })
})
