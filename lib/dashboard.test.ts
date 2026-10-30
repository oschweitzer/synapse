import { describe, it, expect } from 'vitest'
import { DASHBOARDS_MAX, DASHBOARD_NAME_MAX, WIDGETS, WIDGET_IDS, isVisibility, matchesWidgetQuery, normalizeWidgets, widgetsBySource, sensitiveWidgets } from '@/lib/dashboard'

describe('WIDGETS', () => {
  it('a des ids uniques', () => {
    const ids = WIDGETS.map((w) => w.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('décrit chaque widget', () => {
    for (const widget of WIDGETS) {
      expect(widget.label).not.toBe('')
      expect(widget.description).not.toBe('')
      expect(widget.source).not.toBe('')
      expect(typeof widget.sensitive).toBe('boolean')
    }
  })

  it('WIDGET_IDS suit l’ordre du catalogue', () => {
    expect(WIDGET_IDS).toEqual(WIDGETS.map((w) => w.id))
  })

  // Instantané : ajouter un widget oblige à décider s'il est sensible.
  it('marque comme sensibles les données personnelles (mails, santé, argent, humeur)', () => {
    const sensitive = WIDGETS.filter((w) => w.sensitive).map((w) => w.id)
    expect([...sensitive].sort()).toEqual(['activities', 'cash', 'mail', 'mood', 'sleep', 'trend'])
  })
})

describe('isVisibility', () => {
  it('accepte « public » et « private »', () => {
    expect(isVisibility('public')).toBe(true)
    expect(isVisibility('private')).toBe(true)
  })

  it('refuse le reste', () => {
    expect(isVisibility('Public')).toBe(false)
    expect(isVisibility('')).toBe(false)
    expect(isVisibility(null)).toBe(false)
    expect(isVisibility(undefined)).toBe(false)
    expect(isVisibility(1)).toBe(false)
  })
})

describe('normalizeWidgets', () => {
  it('retire les ids inconnus et les doublons, en gardant l’ordre donné', () => {
    expect(normalizeWidgets(['weather', 'inconnu', 'cash', 'weather', 'todo'])).toEqual(['weather', 'cash', 'todo'])
  })

  it('rend [] pour null, undefined ou une liste vide', () => {
    expect(normalizeWidgets(null)).toEqual([])
    expect(normalizeWidgets(undefined)).toEqual([])
    expect(normalizeWidgets([])).toEqual([])
  })

  it('garde tout le catalogue tel quel', () => {
    expect(normalizeWidgets(WIDGET_IDS)).toEqual(WIDGET_IDS)
  })
})

describe('sensitiveWidgets', () => {
  it('ne garde que les ids sensibles, dans l’ordre donné', () => {
    expect(sensitiveWidgets(['weather', 'cash', 'todo', 'mail'])).toEqual(['cash', 'mail'])
  })

  it('rend [] sans widget sensible', () => {
    expect(sensitiveWidgets(['weather', 'todo'])).toEqual([])
    expect(sensitiveWidgets([])).toEqual([])
  })
})

describe('limites', () => {
  it('fixe les longueurs et le nombre de dashboards', () => {
    expect(DASHBOARD_NAME_MAX).toBe(40)
    expect(DASHBOARDS_MAX).toBe(10)
  })
})

describe('matchesWidgetQuery', () => {
  const find = (id: string) => WIDGETS.find((w) => w.id === id)!

  it('accepte tous les widgets pour une recherche vide ou blanche', () => {
    for (const widget of WIDGETS) {
      expect(matchesWidgetQuery(widget, '')).toBe(true)
      expect(matchesWidgetQuery(widget, '   ')).toBe(true)
    }
  })

  it('cherche dans le libellé, la description et la source, sans casse ni accents', () => {
    expect(matchesWidgetQuery(find('weather'), 'meteo')).toBe(true)
    expect(matchesWidgetQuery(find('activities'), 'GARMIN')).toBe(true)
    expect(matchesWidgetQuery(find('mail'), 'en-tetes')).toBe(true)
    expect(matchesWidgetQuery(find('mail'), 'garmin')).toBe(false)
  })

  it('ne trouve rien pour « zzz »', () => {
    expect(WIDGETS.filter((w) => matchesWidgetQuery(w, 'zzz'))).toEqual([])
  })
})

describe('widgetsBySource', () => {
  it('groupe par source dans l’ordre de première apparition et garde l’ordre du catalogue dans un groupe', () => {
    const groups = widgetsBySource(WIDGETS)
    expect(groups.map((g) => g.source).slice(0, 4)).toEqual(['Garmin', 'Gmail', 'Google Sheets', 'Cairn'])
    expect(groups[0].widgets.map((w) => w.id)).toEqual(['activities', 'trend', 'sleep'])
    expect(groups.flatMap((g) => g.widgets)).toHaveLength(WIDGETS.length)
  })
})
