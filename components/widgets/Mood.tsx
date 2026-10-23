import Link from 'next/link'
import { STREAK_WINDOW, type Habits, type Mood } from '@/lib/connectors/mood'
import { MOOD_LABELS } from '@/lib/mood'
import { HabitCheck } from './HabitCheck'
import { MoodPicker } from './MoodPicker'

const muted = 'text-slate-500 dark:text-slate-400'

/** Jour AAAA-MM-JJ (stocké tel quel), lu en UTC pour ne pas changer de date. */
function formatDay(iso: string, options: Intl.DateTimeFormatOptions) {
  return new Date(iso).toLocaleDateString('fr-FR', { timeZone: 'UTC', ...options })
}

const weekday = (iso: string) => formatDay(iso, { weekday: 'narrow' })
const longDay = (iso: string) => formatDay(iso, { weekday: 'long', day: 'numeric', month: 'short' })

// Humeur ---------------------------------------------------------------------------

export function MoodWidget({ mood }: { mood: Mood }) {
  return (
    <div className="flex flex-col gap-3">
      <MoodPicker score={mood.today?.score ?? null} note={mood.today?.note ?? null} />
      <ol aria-label="7 derniers jours" className="grid grid-cols-7 gap-1 text-center">
        {mood.days.map((d) => {
          const label = d.score != null ? MOOD_LABELS[d.score] : null
          return (
            <li key={d.key} className="flex flex-col items-center gap-0.5">
              <span
                className={`text-lg ${label ? '' : 'text-slate-300 dark:text-slate-700'}`}
                title={`${longDay(d.date)} : ${label?.label ?? 'non renseigné'}`}
                aria-label={`${longDay(d.date)} : ${label?.label ?? 'non renseigné'}`}
              >
                {label?.emoji ?? '·'}
              </span>
              <span aria-hidden="true" className={`text-xs ${muted}`}>
                {weekday(d.date)}
              </span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

// Habitudes ------------------------------------------------------------------------

function streakLabel(streak: number, max: boolean) {
  if (streak === 0) return null
  return `${streak}${max ? '+' : ''} j`
}

export function HabitsWidget({ habits }: { habits: Habits }) {
  if (habits.status === 'empty') {
    return (
      <p className={`text-sm ${muted}`}>
        Aucune habitude suivie.{' '}
        <Link href="/settings" className="underline">
          En ajouter
        </Link>
      </p>
    )
  }

  return (
    <ul className="flex flex-col gap-3">
      {habits.habits.map((habit) => {
        const streak = streakLabel(habit.streak, habit.streak >= STREAK_WINDOW)
        return (
          <li key={habit.id} className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2">
              <HabitCheck id={habit.id} name={habit.name} done={habit.doneToday} />
              {streak && (
                <span className={`shrink-0 text-xs tabular-nums ${muted}`} title="Jours d’affilée">
                  🔥 {streak}
                </span>
              )}
            </div>
            <ol aria-label={`${habit.name}, 7 derniers jours`} className="flex gap-1 pl-6">
              {habit.days.map((d) => (
                <li
                  key={d.key}
                  title={`${longDay(d.date)} : ${d.done ? 'fait' : 'pas fait'}`}
                  aria-label={`${longDay(d.date)} : ${d.done ? 'fait' : 'pas fait'}`}
                  className={`h-2 flex-1 rounded-sm ${d.done ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-slate-800'}`}
                />
              ))}
            </ol>
          </li>
        )
      })}
    </ul>
  )
}
