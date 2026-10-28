import { describe, it, expect } from 'vitest'
import { WIDGET_IDS } from '@/lib/dashboard'
import { listDashboards } from '@/lib/dashboards'
import { mockSupabase } from '@/test/supabase-mock'

const dashboard = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  name: `Dashboard ${id}`,
  visibility: 'private',
  is_default: false,
  position: 0,
  created_at: '2026-01-01T00:00:00Z',
  ...over,
})

const widget = (dashboard_id: string, widget_id: string, position = 0) => ({ dashboard_id, widget_id, position })

function setup(over: { dashboards?: unknown; widgets?: unknown; ensure?: unknown } = {}) {
  return mockSupabase({
    rpc: { ensure_default_dashboard: { error: over.ensure ?? null } },
    tables: {
      dashboards: { data: over.dashboards ?? [] },
      dashboard_widgets: { data: over.widgets ?? [] },
    },
  })
}

describe('listDashboards', () => {
  it('crée le dashboard par défaut avec tout le catalogue de widgets', async () => {
    const m = setup()
    await listDashboards(m.client)
    expect(m.rpc).toHaveBeenCalledWith('ensure_default_dashboard', { p_widgets: WIDGET_IDS })
  })

  it('lève l’erreur de ensure_default_dashboard telle quelle', async () => {
    const error = new Error('rpc down')
    await expect(listDashboards(setup({ ensure: error }).client)).rejects.toBe(error)
  })

  it('lève l’erreur de lecture des dashboards', async () => {
    const error = new Error('dashboards down')
    const m = mockSupabase({
      rpc: { ensure_default_dashboard: {} },
      tables: { dashboards: { error }, dashboard_widgets: { data: [] } },
    })
    await expect(listDashboards(m.client)).rejects.toBe(error)
  })

  it('lève l’erreur de lecture des widgets', async () => {
    const error = new Error('widgets down')
    const m = mockSupabase({
      rpc: { ensure_default_dashboard: {} },
      tables: { dashboards: { data: [] }, dashboard_widgets: { error } },
    })
    await expect(listDashboards(m.client)).rejects.toBe(error)
  })

  it('rend [] sans dashboard', async () => {
    expect(await listDashboards(setup().client)).toEqual([])
  })

  it('regroupe les widgets par dashboard, dans l’ordre reçu', async () => {
    const m = setup({
      dashboards: [dashboard('a'), dashboard('b')],
      widgets: [widget('a', 'weather', 0), widget('b', 'todo', 0), widget('a', 'cash', 1), widget('b', 'mail', 1)],
    })
    const result = await listDashboards(m.client)
    expect(result.map((d) => [d.id, d.widgets])).toEqual([
      ['a', ['weather', 'cash']],
      ['b', ['todo', 'mail']],
    ])
  })

  it('écarte les widgets inconnus et les doublons', async () => {
    const m = setup({
      dashboards: [dashboard('a')],
      widgets: [widget('a', 'weather'), widget('a', 'supprimé'), widget('a', 'weather'), widget('a', 'todo')],
    })
    expect((await listDashboards(m.client))[0].widgets).toEqual(['weather', 'todo'])
  })

  it('rend une liste de widgets vide pour un dashboard sans widget', async () => {
    const m = setup({ dashboards: [dashboard('a')], widgets: [widget('autre', 'weather')] })
    expect((await listDashboards(m.client))[0].widgets).toEqual([])
  })

  it('ne garde « public » que s’il l’est exactement', async () => {
    const m = setup({
      dashboards: [
        dashboard('a', { visibility: 'public' }),
        dashboard('b', { visibility: 'private' }),
        dashboard('c', { visibility: 'autre' }),
        dashboard('d', { visibility: null }),
      ],
    })
    expect((await listDashboards(m.client)).map((d) => d.visibility)).toEqual(['public', 'private', 'private', 'private'])
  })

  it('met le dashboard par défaut en tête, sans bousculer le reste', async () => {
    const m = setup({
      dashboards: [dashboard('a'), dashboard('b', { is_default: true }), dashboard('c')],
    })
    const result = await listDashboards(m.client)
    expect(result.map((d) => d.id)).toEqual(['b', 'a', 'c'])
    expect(result.map((d) => d.isDefault)).toEqual([true, false, false])
  })

  it('rend la forme DashboardRow', async () => {
    const m = setup({
      dashboards: [dashboard('a', { name: 'Maison', visibility: 'public', is_default: true })],
      widgets: [widget('a', 'weather')],
    })
    expect(await listDashboards(m.client)).toEqual([
      { id: 'a', name: 'Maison', visibility: 'public', isDefault: true, widgets: ['weather'] },
    ])
  })

  it('lit dans le schéma synapse, dashboards triés par position puis création', async () => {
    const m = setup()
    await listDashboards(m.client)
    const dashboards = m.calls.filter((c) => c.table === 'dashboards')
    expect(dashboards.every((c) => c.schema === 'synapse')).toBe(true)
    expect(dashboards.filter((c) => c.method === 'order').map((c) => c.args)).toEqual([['position'], ['created_at']])
  })
})
