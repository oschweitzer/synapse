import { createClient } from '@/lib/supabase/server'
import { dayKey, startOfDay } from '@/lib/time'
import type { Tables } from '@/lib/types/synapse'
import type { Connector } from './types'

/**
 * Humeur et habitudes, saisies depuis le dashboard (`synapse.mood_entries`,
 * `synapse.habits`, `synapse.habit_checks`). Le jour est celui d'Europe/Paris.
 */

/** Jours de l'historique affiché, aujourd'hui compris. */
const HISTORY_DAYS = 7
/** Fenêtre lue pour la série en cours : au-delà, on affiche « 90+ j ». */
export const STREAK_WINDOW = 90
/**
 * Habitudes actives au plus. Avec la fenêtre de la série, la lecture reste
 * sous la limite de 1000 lignes par requête de l'API Supabase.
 */
export const HABITS_MAX = 10

type MoodRow = Pick<Tables<{ schema: 'synapse' }, 'mood_entries'>, 'day' | 'score' | 'note'>
type HabitRow = Pick<Tables<{ schema: 'synapse' }, 'habits'>, 'id' | 'name'>
type CheckRow = Pick<Tables<{ schema: 'synapse' }, 'habit_checks'>, 'habit_id' | 'day'>

export type HistoryDay = { key: string; date: string }

/** Les `count` derniers jours (AAAA-MM-JJ), du plus ancien à aujourd'hui. */
export function lastDays(count: number, now = new Date()): HistoryDay[] {
  const days: HistoryDay[] = []
  for (let i = count - 1; i >= 0; i--) {
    const key = dayKey(startOfDay(now, -i))
    days.push({ key, date: `${key}T12:00:00Z` })
  }
  return days
}

export type Mood = {
  today: { score: number; note: string | null } | null
  days: (HistoryDay & { score: number | null })[]
}

export type Habit = {
  id: string
  name: string
  doneToday: boolean
  days: (HistoryDay & { done: boolean })[]
  /** Jours consécutifs faits, jusqu'à aujourd'hui ou, s'il n'est pas encore coché, hier. */
  streak: number
}

export type Habits = { status: 'empty' } | { status: 'ok'; habits: Habit[] }

/**
 * Série en cours. Aujourd'hui pas encore coché ne la casse pas : elle compte
 * alors jusqu'à hier. Plafonnée à la fenêtre lue (`STREAK_WINDOW`).
 */
export function streakOf(doneDays: Set<string>, now = new Date()) {
  let offset = doneDays.has(dayKey(now)) ? 0 : -1
  let streak = 0
  while (streak < STREAK_WINDOW && doneDays.has(dayKey(startOfDay(now, offset)))) {
    streak++
    offset--
  }
  return streak
}

export function toHabits(habits: HabitRow[], checks: CheckRow[], now = new Date()): Habits {
  if (habits.length === 0) return { status: 'empty' }
  const history = lastDays(HISTORY_DAYS, now)
  const today = dayKey(now)
  const byHabit = new Map<string, Set<string>>()
  for (const check of checks) {
    const days = byHabit.get(check.habit_id) ?? new Set<string>()
    days.add(check.day)
    byHabit.set(check.habit_id, days)
  }

  return {
    status: 'ok',
    habits: habits.map((habit) => {
      const done = byHabit.get(habit.id) ?? new Set<string>()
      return {
        id: habit.id,
        name: habit.name,
        doneToday: done.has(today),
        days: history.map((d) => ({ ...d, done: done.has(d.key) })),
        streak: streakOf(done, now),
      }
    }),
  }
}

export const moodConnector: Connector<Mood> = {
  id: 'mood',
  async read() {
    const supabase = await createClient()
    const now = new Date()
    const history = lastDays(HISTORY_DAYS, now)
    const { data, error } = await supabase
      .schema('synapse')
      .from('mood_entries')
      .select('day, score, note')
      .gte('day', history[0].key)
      .order('day')
    if (error) throw error

    const byDay = new Map((data as MoodRow[]).map((row) => [row.day, row]))
    const today = byDay.get(dayKey(now))
    return {
      data: {
        today: today ? { score: today.score, note: today.note } : null,
        days: history.map((d) => ({ ...d, score: byDay.get(d.key)?.score ?? null })),
      },
      syncedAt: null,
    }
  },
}

export const habitsConnector: Connector<Habits> = {
  id: 'habits',
  async read() {
    const supabase = await createClient()
    const now = new Date()
    // Fenêtre de la série, plus hier si aujourd'hui n'est pas coché.
    const since = dayKey(startOfDay(now, -STREAK_WINDOW))
    const habits = await supabase
      .schema('synapse')
      .from('habits')
      .select('id, name')
      .is('archived_at', null)
      .order('position')
      .order('created_at')
      .limit(HABITS_MAX)
    if (habits.error) throw habits.error
    const rows = habits.data as HabitRow[]
    if (rows.length === 0) return { data: { status: 'empty' }, syncedAt: null }

    const checks = await supabase
      .schema('synapse')
      .from('habit_checks')
      .select('habit_id, day')
      .in('habit_id', rows.map((habit) => habit.id))
      .gte('day', since)
    if (checks.error) throw checks.error

    return { data: toHabits(rows, checks.data as CheckRow[], now), syncedAt: null }
  },
}

/** Habitudes non archivées, pour les réglages. */
export async function listHabits() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .schema('synapse')
    .from('habits')
    .select('id, name')
    .is('archived_at', null)
    .order('position')
    .order('created_at')
  if (error) throw error
  return data as HabitRow[]
}
