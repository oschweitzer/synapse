import { describe, it, expect } from 'vitest'
import type { CalendarEvent } from '@/lib/connectors/google'
import {
  addDays,
  eventDayKeys,
  eventsByDay,
  monthGrid,
  monthKey,
  monthRange,
  readableText,
  shiftMonth,
} from '@/lib/agenda-month'

let seq = 0
const event = (over: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id: `cal/e${++seq}`,
  title: 'Réunion',
  location: null,
  allDay: false,
  startAt: '2026-01-15T14:00:00Z',
  endAt: '2026-01-15T15:00:00Z',
  htmlLink: null,
  color: null,
  isPast: false,
  ...over,
})

describe('monthKey', () => {
  it('donne le mois de Paris, pas celui d’UTC', () => {
    expect(monthKey(new Date('2026-01-31T23:30:00Z'))).toBe('2026-02')
    expect(monthKey(new Date('2026-01-15T10:00:00Z'))).toBe('2026-01')
  })
})

describe('shiftMonth', () => {
  it('refuse une clé de mois mal formée', () => {
    expect(() => shiftMonth('2026-13', 1)).toThrow(RangeError)
    expect(() => shiftMonth('2026-06-01', 1)).toThrow(RangeError)
  })

  it('passe d’une année à l’autre', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
    expect(shiftMonth('2026-05', 0)).toBe('2026-05')
    expect(shiftMonth('2026-01', -13)).toBe('2024-12')
  })
})

describe('monthGrid', () => {
  const flat = (key: string) => monthGrid(key).flat()

  it('refuse une clé de mois mal formée au lieu de rendre des dates NaN', () => {
    for (const key of ['', 'juin', '2026', '2026-6', '2026-13', '2026-00', '2026-06-01', '2026-06 ', 'x2026-06']) {
      expect(() => monthGrid(key), key).toThrow(RangeError)
    }
  })

  it('commence le 1er sans jour avant quand il tombe un lundi (juin 2026)', () => {
    const days = flat('2026-06')
    expect(days[0]).toEqual({ key: '2026-06-01', inMonth: true })
    expect(days.at(-1)).toEqual({ key: '2026-07-12', inMonth: false })
  })

  it('complète la première semaine avec le mois précédent (février 2026 commence un dimanche)', () => {
    const [first] = monthGrid('2026-02')
    expect(first.map((d) => d.key)).toEqual([
      '2026-01-26',
      '2026-01-27',
      '2026-01-28',
      '2026-01-29',
      '2026-01-30',
      '2026-01-31',
      '2026-02-01',
    ])
    expect(first.slice(0, 6).every((d) => !d.inMonth)).toBe(true)
    expect(first[6].inMonth).toBe(true)
  })

  it('rend toujours 6 semaines de 7 jours consécutifs, commençant un lundi', () => {
    for (const key of ['2026-02', '2026-06', '2025-12', '2026-03']) {
      const weeks = monthGrid(key)
      expect(weeks).toHaveLength(6)
      for (const week of weeks) {
        expect(week).toHaveLength(7)
        // Le jour 0 de la semaine est un lundi.
        expect(new Date(`${week[0].key}T00:00:00Z`).getUTCDay()).toBe(1)
      }
      const keys = weeks.flat().map((d) => d.key)
      keys.slice(1).forEach((k, i) => {
        expect(Date.parse(`${k}T00:00:00Z`) - Date.parse(`${keys[i]}T00:00:00Z`)).toBe(86_400_000)
      })
      expect(weeks.flat().filter((d) => d.inMonth).every((d) => d.key.startsWith(key))).toBe(true)
    }
  })
})

describe('eventDayKeys', () => {
  it('« toute la journée » d’un jour : ce jour seulement (fin exclusive)', () => {
    expect(eventDayKeys({ allDay: true, startAt: '2026-01-15T00:00:00Z', endAt: '2026-01-16T00:00:00Z' })).toEqual(['2026-01-15'])
  })

  it('« toute la journée » sur plusieurs jours : chaque jour, sans le jour de fin', () => {
    expect(eventDayKeys({ allDay: true, startAt: '2026-01-15T00:00:00Z', endAt: '2026-01-18T00:00:00Z' })).toEqual([
      '2026-01-15',
      '2026-01-16',
      '2026-01-17',
    ])
  })

  it('évènement horaire à cheval sur minuit (heure de Paris)', () => {
    expect(eventDayKeys({ allDay: false, startAt: '2026-01-15T22:00:00Z', endAt: '2026-01-15T23:30:00Z' })).toEqual([
      '2026-01-15',
      '2026-01-16',
    ])
  })

  it('évènement horaire qui finit pile à minuit de Paris : le jour de début seulement', () => {
    expect(eventDayKeys({ allDay: false, startAt: '2026-01-15T22:00:00Z', endAt: '2026-01-15T23:00:00Z' })).toEqual(['2026-01-15'])
  })

  it('changements d’heure : un jour de 23 h ou de 25 h ne décale rien', () => {
    expect(eventDayKeys({ allDay: false, startAt: '2026-03-28T23:30:00Z', endAt: '2026-03-29T00:30:00Z' })).toEqual(['2026-03-29'])
    expect(eventDayKeys({ allDay: false, startAt: '2026-10-25T22:30:00Z', endAt: '2026-10-25T22:45:00Z' })).toEqual(['2026-10-25'])
  })

  it('évènement sans durée : son jour de début', () => {
    expect(eventDayKeys({ allDay: false, startAt: '2026-01-15T14:00:00Z', endAt: '2026-01-15T14:00:00Z' })).toEqual(['2026-01-15'])
  })

  it('traverse un changement de mois et d’année', () => {
    expect(eventDayKeys({ allDay: true, startAt: '2025-12-30T00:00:00Z', endAt: '2026-01-02T00:00:00Z' })).toEqual([
      '2025-12-30',
      '2025-12-31',
      '2026-01-01',
    ])
  })
})

describe('eventsByDay', () => {
  it('range un évènement de 2 jours sous chacun de ses jours', () => {
    const trip = event({ id: 'cal/trip', allDay: true, startAt: '2026-01-15T00:00:00Z', endAt: '2026-01-17T00:00:00Z' })
    const byDay = eventsByDay([trip])
    expect(Object.keys(byDay).sort()).toEqual(['2026-01-15', '2026-01-16'])
    expect(byDay['2026-01-15']).toEqual([trip])
    expect(byDay['2026-01-16']).toEqual([trip])
  })

  it('un jour : « toute la journée » en tête, puis par heure de début', () => {
    const allDay = event({ id: 'cal/allday', allDay: true, startAt: '2026-01-16T00:00:00Z', endAt: '2026-01-17T00:00:00Z' })
    // 00:30 à Paris le 16 : après le « toute la journée » malgré une heure de début plus tôt.
    const night = event({ id: 'cal/night', startAt: '2026-01-15T23:30:00Z', endAt: '2026-01-16T00:30:00Z' })
    const nine = event({ id: 'cal/nine', startAt: '2026-01-16T09:00:00Z', endAt: '2026-01-16T10:00:00Z' })
    const two = event({ id: 'cal/two', startAt: '2026-01-16T14:00:00Z', endAt: '2026-01-16T15:00:00Z' })
    const ids = (list: CalendarEvent[]) => eventsByDay(list)['2026-01-16'].map((e) => e.id)
    expect(ids([two, nine, night, allDay])).toEqual(['cal/allday', 'cal/night', 'cal/nine', 'cal/two'])
    expect(ids([allDay, night, nine, two])).toEqual(['cal/allday', 'cal/night', 'cal/nine', 'cal/two'])
  })

  it('ne crée pas de clé pour un jour sans évènement', () => {
    expect(eventsByDay([])).toEqual({})
  })
})

describe('monthRange', () => {
  it('couvre les grilles du mois précédent et du suivant, avec une marge', () => {
    const range = monthRange(new Date('2026-01-15T10:00:00Z'))
    expect(range.todayKey).toBe('2026-01-15')
    expect(range.firstMonth).toBe('2025-12')
    expect(range.lastMonth).toBe('2026-02')
    // Grille de décembre 2025 : lundi 1er déc. ; grille de février 2026 : jusqu'au 8 mars.
    expect(range.from.toISOString()).toBe('2025-11-29T23:00:00.000Z')
    expect(range.to.toISOString()).toBe('2026-03-09T23:00:00.000Z')
  })
})

describe('addDays', () => {
  it('passe d’un mois à l’autre, dans les deux sens', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01')
    expect(addDays('2026-03-02', -7)).toBe('2026-02-23')
  })
})

describe('readableText', () => {
  it('donne du blanc sur un fond sombre', () => {
    expect(readableText('#000000')).toBe('#ffffff')
    expect(readableText('#1e3a8a')).toBe('#ffffff')
  })

  it('donne du slate-900 sur un fond clair', () => {
    expect(readableText('#ffffff')).toBe('#0f172a')
    expect(readableText('#fbd75b')).toBe('#0f172a')
  })

  it('accepte la forme courte #rgb et les majuscules', () => {
    expect(readableText('#fff')).toBe('#0f172a')
    expect(readableText('#000')).toBe('#ffffff')
    expect(readableText('#FBD75B')).toBe('#0f172a')
  })

  it('retombe sur slate-900 pour une couleur invalide', () => {
    expect(readableText('rouge')).toBe('#0f172a')
    expect(readableText('#12345')).toBe('#0f172a')
  })
})
