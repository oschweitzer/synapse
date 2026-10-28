import { describe, it, expect } from 'vitest'
import { DASHBOARDS_MAX, DASHBOARD_NAME_MAX, WIDGETS, WIDGET_IDS, isVisibility, normalizeWidgets, sensitiveWidgets } from '@/lib/dashboard'

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
