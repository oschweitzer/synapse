import { createClient } from '@/lib/supabase/server'
import { dayKey, startOfDay } from '@/lib/time'
import type { Tables } from '@/lib/types/synapse'
import type { Connector } from './types'

/**
 * Garmin, lu dans `synapse.garmin_*` rempli par le job GitHub Actions
 * jobs/garmin/sync.py (toutes les 3 h). Le dashboard n'appelle jamais Garmin.
 */

/** Activités affichées dans le widget. */
const ACTIVITY_LIMIT = 5
/** Jours de la tendance, aujourd'hui compris. */
const TREND_DAYS = 7

type DailyRow = Tables<{ schema: 'synapse' }, 'garmin_daily'>
type ActivityRow = Pick<
  Tables<{ schema: 'synapse' }, 'garmin_activities'>,
  | 'activity_id'
  | 'name'
  | 'activity_type'
  | 'start_at'
  | 'duration_seconds'
  | 'distance_meters'
  | 'avg_hr'
  | 'elevation_gain_meters'
>

export type Night = {
  /** Jour du réveil (AAAA-MM-JJ). */
  day: string
  isToday: boolean
  sleepStartAt: string | null
  sleepEndAt: string | null
  sleepSeconds: number
  deepSeconds: number | null
  lightSeconds: number | null
  remSeconds: number | null
  awakeSeconds: number | null
  score: number | null
  bodyBatteryCharged: number | null
  bodyBatteryAtWake: number | null
}

export type Sleep = { status: 'empty' } | { status: 'ok'; night: Night }

export type Activity = {
  id: number
  title: string
  type: string | null
  startAt: string
  durationSeconds: number | null
  distanceMeters: number | null
  avgHr: number | null
  elevationGainMeters: number | null
}

export type Activities = { status: 'empty' } | { status: 'ok'; activities: Activity[] }

export type TrendDay = { key: string; date: string; steps: number | null; restingHr: number | null }

export type Trend = {
  status: 'empty' | 'ok'
  days: TrendDay[]
  stepsGoal: number | null
  avgSteps: number | null
  avgRestingHr: number | null
}

/** Libellés des types d'activité Garmin les plus courants. */
const ACTIVITY_LABELS: Record<string, string> = {
  running: 'Course à pied',
  treadmill_running: 'Course sur tapis',
  trail_running: 'Trail',
  track_running: 'Piste',
  cycling: 'Vélo',
  road_biking: 'Vélo de route',
  mountain_biking: 'VTT',
  gravel_cycling: 'Gravel',
  indoor_cycling: 'Vélo d’intérieur',
  walking: 'Marche',
  hiking: 'Randonnée',
  lap_swimming: 'Natation',
  open_water_swimming: 'Eau libre',
  strength_training: 'Renforcement',
  cardio: 'Cardio',
  hiit: 'HIIT',
  yoga: 'Yoga',
  pilates: 'Pilates',
  elliptical: 'Elliptique',
  indoor_rowing: 'Rameur',
  resort_skiing: 'Ski',
  backcountry_skiing: 'Ski de randonnée',
  cross_country_skiing_ws: 'Ski de fond',
}

export function activityLabel(type: string | null) {
  if (!type) return null
  return ACTIVITY_LABELS[type] ?? type.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())
}

/** Fin de la dernière synchro Garmin réussie. */
async function readSyncedAt() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .schema('synapse')
    .from('sync_runs')
    .select('finished_at')
    .eq('source', 'garmin')
    .eq('status', 'success')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data?.finished_at ? new Date(data.finished_at as string) : null
}

export function toNight(row: DailyRow, now = new Date()): Night | null {
  if (row.sleep_seconds == null || row.sleep_seconds <= 0) return null
  return {
    day: row.day,
    isToday: row.day === dayKey(now),
    sleepStartAt: row.sleep_start_at,
    sleepEndAt: row.sleep_end_at,
    sleepSeconds: row.sleep_seconds,
    deepSeconds: row.deep_sleep_seconds,
    lightSeconds: row.light_sleep_seconds,
    remSeconds: row.rem_sleep_seconds,
    awakeSeconds: row.awake_seconds,
    score: row.sleep_score,
    bodyBatteryCharged: row.body_battery_charged,
    bodyBatteryAtWake: row.body_battery_at_wake,
  }
}

const average = (values: (number | null)[]) => {
  const known = values.filter((v): v is number => v != null)
  return known.length ? Math.round(known.reduce((a, b) => a + b, 0) / known.length) : null
}

/** Les 7 derniers jours, aujourd'hui compris ; un jour sans ligne reste vide. */
export function toTrend(rows: Pick<DailyRow, 'day' | 'steps' | 'steps_goal' | 'resting_hr'>[], now = new Date()): Trend {
  const byDay = new Map(rows.map((row) => [row.day, row]))
  const days: TrendDay[] = []
  for (let i = TREND_DAYS - 1; i >= 0; i--) {
    const key = dayKey(startOfDay(now, -i))
    const row = byDay.get(key)
    days.push({ key, date: `${key}T12:00:00Z`, steps: row?.steps ?? null, restingHr: row?.resting_hr ?? null })
  }
  // Objectif le plus récent : Garmin l'ajuste d'un jour à l'autre.
  const goal = [...rows].sort((a, b) => b.day.localeCompare(a.day)).find((row) => row.steps_goal)?.steps_goal ?? null
  const hasData = days.some((d) => d.steps != null || d.restingHr != null)

  return {
    status: hasData ? 'ok' : 'empty',
    days,
    stepsGoal: goal,
    avgSteps: average(days.map((d) => d.steps)),
    avgRestingHr: average(days.map((d) => d.restingHr)),
  }
}

export const sleepConnector: Connector<Sleep> = {
  id: 'garmin',
  async read() {
    const supabase = await createClient()
    const [daily, syncedAt] = await Promise.all([
      supabase
        .schema('synapse')
        .from('garmin_daily')
        .select('*')
        // Nuit la plus récente : celle de ce matin, sinon une précédente (montre non portée…).
        .gt('sleep_seconds', 0)
        .order('day', { ascending: false })
        .limit(1)
        .maybeSingle(),
      readSyncedAt(),
    ])
    if (daily.error) throw daily.error

    const night = daily.data && toNight(daily.data as DailyRow)
    return { data: night ? { status: 'ok', night } : { status: 'empty' }, syncedAt }
  },
}

export const activitiesConnector: Connector<Activities> = {
  id: 'garmin',
  async read() {
    const supabase = await createClient()
    const [activities, syncedAt] = await Promise.all([
      supabase
        .schema('synapse')
        .from('garmin_activities')
        .select('activity_id, name, activity_type, start_at, duration_seconds, distance_meters, avg_hr, elevation_gain_meters')
        .order('start_at', { ascending: false })
        .limit(ACTIVITY_LIMIT),
      readSyncedAt(),
    ])
    if (activities.error) throw activities.error

    const rows = activities.data as ActivityRow[]
    if (rows.length === 0) return { data: { status: 'empty' }, syncedAt }
    return {
      data: {
        status: 'ok',
        activities: rows.map((row) => ({
          id: row.activity_id,
          title: row.name?.trim() || activityLabel(row.activity_type) || 'Activité',
          type: activityLabel(row.activity_type),
          startAt: row.start_at,
          durationSeconds: row.duration_seconds,
          distanceMeters: row.distance_meters,
          avgHr: row.avg_hr,
          elevationGainMeters: row.elevation_gain_meters,
        })),
      },
      syncedAt,
    }
  },
}

export const trendConnector: Connector<Trend> = {
  id: 'garmin',
  async read() {
    const supabase = await createClient()
    const now = new Date()
    const [daily, syncedAt] = await Promise.all([
      supabase
        .schema('synapse')
        .from('garmin_daily')
        .select('day, steps, steps_goal, resting_hr')
        .gte('day', dayKey(startOfDay(now, -(TREND_DAYS - 1))))
        .order('day'),
      readSyncedAt(),
    ])
    if (daily.error) throw daily.error

    return { data: toTrend(daily.data as DailyRow[], now), syncedAt }
  },
}
