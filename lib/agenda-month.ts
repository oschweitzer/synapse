import type { CalendarEvent } from '@/lib/connectors/google'
import { isMonthKey } from '@/lib/cash'
import { dayKey, startOfDay } from '@/lib/time'

/**
 * Calculs de dates de la vue mensuelle de l'agenda. Module pur (ni React, ni
 * Supabase) : le widget peut l'importer côté client. Le type `CalendarEvent`
 * est importé en `import type` pour ne pas créer de cycle à l'exécution.
 */

const DAY_MS = 86_400_000

/** « AAAA-MM-JJ » ou « AAAA-MM » en nombres [année, mois, jour]. */
function parseKey(key: string) {
  const [y, m, d = 1] = key.split('-').map(Number)
  return [y, m, d] as const
}

/** Clé de mois « AAAA-MM » en [année, mois] ; lève une `RangeError` sinon, plutôt que de produire des dates NaN. */
function parseMonth(key: string) {
  if (!isMonthKey(key)) throw new RangeError(`clé de mois invalide : « ${key} » (attendu AAAA-MM)`)
  const [y, m] = parseKey(key)
  return [y, m] as const
}

/** Jour décalé de `n` jours : arithmétique de calendrier en UTC, un changement d'heure ne décale jamais un jour. */
export function addDays(key: string, n: number) {
  const [y, m, d] = parseKey(key)
  return dayKey(new Date(Date.UTC(y, m - 1, d + n)), 'UTC')
}

/** Nombre de jours entre deux clés AAAA-MM-JJ (positif si `b` est après `a`). */
function daysBetween(a: string, b: string) {
  const [ya, ma, da] = parseKey(a)
  const [yb, mb, db] = parseKey(b)
  return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / DAY_MS)
}

/** Mois (AAAA-MM) de `date` dans le fuseau de l'app. */
export function monthKey(date: Date) {
  return dayKey(date).slice(0, 7)
}

/** Mois (AAAA-MM) décalé de `delta` mois, à cheval sur les années si besoin. */
export function shiftMonth(key: string, delta: number) {
  const [y, m] = parseMonth(key)
  return dayKey(new Date(Date.UTC(y, m - 1 + delta, 1)), 'UTC').slice(0, 7)
}

export type MonthDay = { key: string; inMonth: boolean }

/** Grille du mois : toujours 6 semaines de 7 jours, du lundi au dimanche. */
export function monthGrid(key: string): MonthDay[][] {
  const [y, m] = parseMonth(key)
  const first = Date.UTC(y, m - 1, 1)
  // Lundi = 0 : nombre de jours du mois précédent en tête de grille.
  const lead = (new Date(first).getUTCDay() + 6) % 7
  const days: MonthDay[] = Array.from({ length: 42 }, (_, i) => {
    const day = dayKey(new Date(Date.UTC(y, m - 1, 1 - lead + i)), 'UTC')
    return { key: day, inMonth: day.slice(0, 7) === key }
  })
  return Array.from({ length: 6 }, (_, w) => days.slice(w * 7, w * 7 + 7))
}

/**
 * Jours (AAAA-MM-JJ) couverts par un évènement, du premier au dernier inclus.
 * Les « toute la journée » sont stockés à minuit UTC avec une fin exclusive :
 * on lit leurs jours en UTC. Les autres se lisent dans le fuseau de l'app, et
 * une fin pile à minuit n'ajoute pas le jour suivant.
 */
export function eventDayKeys(event: Pick<CalendarEvent, 'allDay' | 'startAt' | 'endAt'>): string[] {
  const tz = event.allDay ? 'UTC' : undefined
  const start = Date.parse(event.startAt)
  // Dernière milliseconde de l'évènement ; sans durée, le jour de début.
  const last = Math.max(start, Date.parse(event.endAt) - 1)
  const from = dayKey(new Date(start), tz)
  const to = dayKey(new Date(last), tz)
  const keys: string[] = []
  for (let key = from; key <= to; key = addDays(key, 1)) keys.push(key)
  return keys
}

/** Évènements par jour (un évènement de plusieurs jours figure sous chacun), « toute la journée » en tête puis par heure de début. */
export function eventsByDay(events: CalendarEvent[]): Record<string, CalendarEvent[]> {
  const byDay: Record<string, CalendarEvent[]> = {}
  for (const event of events) {
    for (const key of eventDayKeys(event)) (byDay[key] ??= []).push(event)
  }
  for (const list of Object.values(byDay)) {
    list.sort((a, b) => Number(b.allDay) - Number(a.allDay) || Date.parse(a.startAt) - Date.parse(b.startAt))
  }
  return byDay
}

/**
 * Plage lue pour la vue mensuelle : les grilles du mois précédent, courant et
 * suivant (celle du mois courant est incluse dans les deux autres bornes).
 */
export function monthRange(now = new Date()) {
  const todayKey = dayKey(now)
  const current = monthKey(now)
  const firstMonth = shiftMonth(current, -1)
  const lastMonth = shiftMonth(current, 1)
  const gridStart = monthGrid(firstMonth)[0][0].key
  const gridEnd = monthGrid(lastMonth)[5][6].key
  // Un jour de marge avant et deux après, comme la requête de la liste :
  // les « toute la journée » sont stockés à minuit UTC.
  return {
    todayKey,
    firstMonth,
    lastMonth,
    from: startOfDay(now, daysBetween(todayKey, gridStart) - 1),
    to: startOfDay(now, daysBetween(todayKey, gridEnd) + 2),
  }
}

/**
 * Couleur de texte lisible sur une couleur Google (`#rgb` ou `#rrggbb`) quand
 * Google ne donne pas de premier plan : blanc sur fond sombre, sinon slate-900
 * (luminance relative WCAG). Une couleur invalide donne slate-900.
 */
export function readableText(hex: string) {
  const dark = '#0f172a'
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex)
  if (!m) return dark
  const digits = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1]
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(digits.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.179 ? dark : '#ffffff'
}
