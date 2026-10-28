import { describe, it, expect, vi, afterEach } from 'vitest'
import { TIME_ZONE, dayKey, endOfToday, startOfDay } from '@/lib/time'

const at = (iso: string) => new Date(iso)

afterEach(() => {
  vi.useRealTimers()
})

describe('TIME_ZONE', () => {
  it('vaut Europe/Paris', () => {
    expect(TIME_ZONE).toBe('Europe/Paris')
  })
})

describe('startOfDay', () => {
  it("renvoie minuit de Paris en hiver (UTC+1)", () => {
    expect(startOfDay(at('2026-01-15T10:00:00Z')).toISOString()).toBe('2026-01-14T23:00:00.000Z')
  })

  it("renvoie minuit de Paris en été (UTC+2)", () => {
    expect(startOfDay(at('2026-07-15T10:00:00Z')).toISOString()).toBe('2026-07-14T22:00:00.000Z')
  })

  it('compte déjà le lendemain à Paris quand il est tard en UTC', () => {
    expect(startOfDay(at('2026-07-15T22:30:00Z')).toISOString()).toBe('2026-07-15T22:00:00.000Z')
  })

  it("passage à l'heure d'été (29 mars 2026) : le jour dure 23 h", () => {
    const now = at('2026-03-29T12:00:00Z')
    expect(startOfDay(now).toISOString()).toBe('2026-03-28T23:00:00.000Z')
    expect(startOfDay(now, 1).toISOString()).toBe('2026-03-29T22:00:00.000Z')
  })

  it("passage à l'heure d'hiver (25 octobre 2026) : minuit suivant est en UTC+1", () => {
    const now = at('2026-10-25T12:00:00Z')
    expect(startOfDay(now).toISOString()).toBe('2026-10-24T22:00:00.000Z')
    expect(endOfToday(now).toISOString()).toBe('2026-10-25T23:00:00.000Z')
  })

  it('accepte un décalage négatif en jours, à cheval sur deux mois', () => {
    expect(startOfDay(at('2026-03-03T12:00:00Z'), -7).toISOString()).toBe('2026-02-23T23:00:00.000Z')
  })

  it('accepte un autre fuseau', () => {
    expect(startOfDay(at('2026-07-15T10:00:00Z'), 0, 'UTC').toISOString()).toBe('2026-07-15T00:00:00.000Z')
  })

  it("utilise la date courante par défaut", () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(at('2026-01-15T10:00:00Z'))
    expect(startOfDay().toISOString()).toBe('2026-01-14T23:00:00.000Z')
  })
})

describe('endOfToday', () => {
  it('renvoie le minuit suivant', () => {
    expect(endOfToday(at('2026-01-15T10:00:00Z')).toISOString()).toBe('2026-01-15T23:00:00.000Z')
  })

  it("utilise la date courante par défaut", () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(at('2026-07-15T10:00:00Z'))
    expect(endOfToday().toISOString()).toBe('2026-07-15T22:00:00.000Z')
  })
})

describe('dayKey', () => {
  it('formate AAAA-MM-JJ avec la date de Paris', () => {
    expect(dayKey(at('2026-01-01T23:30:00Z'))).toBe('2026-01-02')
  })

  it('complète le mois et le jour sur deux chiffres', () => {
    expect(dayKey(at('2026-03-05T12:00:00Z'))).toBe('2026-03-05')
  })

  it('accepte un autre fuseau', () => {
    expect(dayKey(at('2026-01-01T23:30:00Z'), 'UTC')).toBe('2026-01-01')
  })
})
