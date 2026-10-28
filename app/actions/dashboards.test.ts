import { describe, it, expect, vi, beforeEach } from 'vitest'
import { redirect } from 'next/navigation'
import { DASHBOARDS_MAX, DASHBOARD_NAME_MAX, WIDGET_IDS } from '@/lib/dashboard'
import { mockServerClient, testUser } from '@/test/supabase-mock'
import { expectRedirect, form, throwRedirect } from '@/test/next-mock'
import { createDashboard, deleteDashboard, resetDashboardOrder, saveDashboard, setDefaultDashboard } from './dashboards'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const ID = '11111111-1111-4111-8111-111111111111'
const to = (code: string) => `/settings?dashboards=${code}#dashboards`
const rows = (...ids: string[]) => ids.map((widget_id) => ({ widget_id }))
const valid = () => form({ id: ID, name: 'Perso', visibility: 'private', widgets: ['todo'] })
const boom = { message: 'boom' }

function setup(opts: Parameters<typeof mockServerClient>[0] = {}) {
  return mockServerClient({ user: testUser('admin@x.fr'), ...opts })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('ALLOWED_EMAILS', 'admin@x.fr,user@x.fr')
  vi.stubEnv('ADMIN_EMAILS', 'admin@x.fr')
  vi.mocked(redirect).mockImplementation(throwRedirect)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

// Seules actions réservées à l'admin : droits vérifiés côté serveur, et aucune table ni rpc touchée avant.
describe.each([
  ['createDashboard', createDashboard],
  ['saveDashboard', saveDashboard],
  ['resetDashboardOrder', resetDashboardOrder],
  ['setDefaultDashboard', setDefaultDashboard],
  ['deleteDashboard', deleteDashboard],
])('%s : accès', (_name, action) => {
  it.each([
    ['sans session', null, '/login'],
    ['compte hors liste blanche', testUser('intrus@x.fr'), to('forbidden')],
    ['compte autorisé mais non admin', testUser('user@x.fr'), to('forbidden')],
  ])('%s : refusé sans toucher à la base', async (_label, user, url) => {
    const { calls, rpc, invoke } = setup({ user })
    await expectRedirect(action(valid()), url)
    expect(calls).toEqual([])
    expect(rpc).not.toHaveBeenCalled()
    expect(invoke).not.toHaveBeenCalled()
  })
})

describe('createDashboard', () => {
  it.each([
    ['nom vide', ''],
    ['nom trop long', 'x'.repeat(DASHBOARD_NAME_MAX + 1)],
  ])('refuse un %s', async (_label, name) => {
    setup()
    await expectRedirect(createDashboard(form({ name, visibility: 'private' })), to('name'))
  })

  it('refuse une visibilité inconnue', async () => {
    setup()
    await expectRedirect(createDashboard(form({ name: 'Perso', visibility: 'secret' })), to('invalid'))
  })

  it('remonte une erreur de comptage', async () => {
    setup({ tables: { 'synapse.dashboards': { error: boom } } })
    await expectRedirect(createDashboard(form({ name: 'Perso', visibility: 'private' })), to('save'))
  })

  it('refuse au-delà du maximum de dashboards', async () => {
    const { calls } = setup({ tables: { 'synapse.dashboards': { count: DASHBOARDS_MAX } } })
    await expectRedirect(createDashboard(form({ name: 'Perso', visibility: 'private' })), to('max'))
    expect(calls.some((c) => c.method === 'insert')).toBe(false)
  })

  it('remonte une erreur d’insertion', async () => {
    setup({ tables: { 'synapse.dashboards': [{ count: 1 }, { error: boom }] } })
    await expectRedirect(createDashboard(form({ name: 'Perso', visibility: 'private' })), to('save'))
  })

  it('crée le dashboard en dernière position', async () => {
    const { calls } = setup({ tables: { 'synapse.dashboards': [{ count: 3 }, { data: null }] } })
    await expectRedirect(createDashboard(form({ name: ' Perso ', visibility: 'public' })), to('created'))
    expect(calls.find((c) => c.method === 'insert')?.args[0]).toEqual({ name: 'Perso', visibility: 'public', position: 3 })
  })
})

describe('saveDashboard', () => {
  const tables = () => ({
    'synapse.dashboard_widgets': { data: rows('weather', 'todo') },
    'synapse.dashboards': { data: [{ id: ID }] },
  })

  it('refuse un id invalide', async () => {
    setup()
    await expectRedirect(saveDashboard(form({ id: 'nope', name: 'Perso', visibility: 'private' })), to('invalid'))
  })

  it('refuse un widget sensible sur un dashboard public, sans rien modifier', async () => {
    const { calls, rpc } = setup({ tables: tables() })
    await expectRedirect(
      saveDashboard(form({ id: ID, name: 'Perso', visibility: 'public', widgets: ['todo', 'mail'] })),
      to('sensitive'),
    )
    expect(calls.some((c) => c.method === 'update')).toBe(false)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('remonte une erreur de lecture des widgets', async () => {
    setup({ tables: { ...tables(), 'synapse.dashboard_widgets': { error: boom } } })
    await expectRedirect(saveDashboard(valid()), to('save'))
  })

  it('refuse un dashboard introuvable (ou masqué par la RLS)', async () => {
    setup({ tables: { ...tables(), 'synapse.dashboards': { data: [] } } })
    await expectRedirect(saveDashboard(valid()), to('invalid'))
  })

  it('remonte une erreur de modification', async () => {
    setup({ tables: { ...tables(), 'synapse.dashboards': { error: boom } } })
    await expectRedirect(saveDashboard(valid()), to('save'))
  })

  it('remonte une erreur de set_dashboard_widgets', async () => {
    setup({ tables: tables(), rpc: { set_dashboard_widgets: { error: boom } } })
    await expectRedirect(saveDashboard(valid()), to('save'))
  })

  it('garde l’ordre existant, ajoute les nouveaux widgets dans l’ordre du catalogue', async () => {
    const { rpc, calls } = setup({ tables: tables(), rpc: { set_dashboard_widgets: { data: null } } })
    await expectRedirect(
      saveDashboard(form({ id: ID, name: 'Perso', visibility: 'private', widgets: ['todo', 'agenda', 'weather', 'shopping'] })),
      to('saved'),
    )
    expect(rpc).toHaveBeenCalledWith('set_dashboard_widgets', {
      p_dashboard: ID,
      p_widgets: ['weather', 'todo', 'shopping', 'agenda'],
    })
    expect(calls.find((c) => c.method === 'update')?.args[0]).toEqual({ name: 'Perso', visibility: 'private' })
  })
})

describe('resetDashboardOrder', () => {
  it('remonte une erreur de lecture', async () => {
    setup({ tables: { 'synapse.dashboard_widgets': { error: boom } } })
    await expectRedirect(resetDashboardOrder(valid()), to('save'))
  })

  it('remonte une erreur de set_dashboard_widgets', async () => {
    setup({ tables: { 'synapse.dashboard_widgets': { data: rows('todo') } }, rpc: { set_dashboard_widgets: { error: boom } } })
    await expectRedirect(resetDashboardOrder(valid()), to('save'))
  })

  it('remet les widgets présents dans l’ordre du catalogue', async () => {
    const { rpc } = setup({
      tables: { 'synapse.dashboard_widgets': { data: rows('weather', 'todo', 'mail') } },
      rpc: { set_dashboard_widgets: { data: null } },
    })
    await expectRedirect(resetDashboardOrder(valid()), to('order-reset'))
    const expected = WIDGET_IDS.filter((w) => ['weather', 'todo', 'mail'].includes(w))
    expect(rpc).toHaveBeenCalledWith('set_dashboard_widgets', { p_dashboard: ID, p_widgets: expected })
    expect(expected).toEqual(['mail', 'todo', 'weather'])
  })
})

describe('setDefaultDashboard', () => {
  it('refuse un id invalide', async () => {
    setup()
    await expectRedirect(setDefaultDashboard(form({ id: 'nope' })), to('invalid'))
  })

  it('remonte une erreur de la fonction', async () => {
    setup({ rpc: { set_default_dashboard: { error: boom } } })
    await expectRedirect(setDefaultDashboard(valid()), to('save'))
  })

  it('désigne le dashboard par défaut', async () => {
    const { rpc } = setup({ rpc: { set_default_dashboard: { data: null } } })
    await expectRedirect(setDefaultDashboard(valid()), to('default'))
    expect(rpc).toHaveBeenCalledWith('set_default_dashboard', { p_dashboard: ID })
  })
})

describe('deleteDashboard', () => {
  it('refuse un id invalide', async () => {
    setup()
    await expectRedirect(deleteDashboard(form({ id: 'nope' })), to('invalid'))
  })

  it('remonte une erreur de lecture', async () => {
    setup({ tables: { 'synapse.dashboards': { error: boom } } })
    await expectRedirect(deleteDashboard(valid()), to('save'))
  })

  it('refuse un dashboard introuvable', async () => {
    setup({ tables: { 'synapse.dashboards': { data: null } } })
    await expectRedirect(deleteDashboard(valid()), to('invalid'))
  })

  it('refuse de supprimer le dashboard par défaut', async () => {
    const { calls } = setup({ tables: { 'synapse.dashboards': { data: { is_default: true } } } })
    await expectRedirect(deleteDashboard(valid()), to('default-delete'))
    expect(calls.some((c) => c.method === 'delete')).toBe(false)
  })

  it('remonte une erreur de suppression', async () => {
    setup({ tables: { 'synapse.dashboards': [{ data: { is_default: false } }, { error: boom }] } })
    await expectRedirect(deleteDashboard(valid()), to('save'))
  })

  it('supprime le dashboard', async () => {
    const { calls } = setup({ tables: { 'synapse.dashboards': [{ data: { is_default: false } }, { data: null }] } })
    await expectRedirect(deleteDashboard(valid()), to('deleted'))
    expect(calls.some((c) => c.method === 'delete')).toBe(true)
  })
})
