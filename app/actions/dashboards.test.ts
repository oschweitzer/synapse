import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { DASHBOARDS_MAX, DASHBOARD_NAME_MAX, WIDGET_IDS } from '@/lib/dashboard'
import { mockServerClient, testUser } from '@/test/supabase-mock'
import { expectRedirect, form, throwRedirect } from '@/test/next-mock'
import { createDashboard, deleteDashboard, resetDashboardOrder, saveDashboard, setDefaultDashboard } from './dashboards'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const ID = '11111111-1111-4111-8111-111111111111'
const NOW = new Date('2026-01-15T10:00:00Z')
const AT = NOW.getTime()
const state = (code: string) => ({ code, at: AT })
const rows = (...ids: string[]) => ids.map((widget_id) => ({ widget_id }))
const valid = () => form({ id: ID, name: 'Perso', visibility: 'private', widgets: ['todo'] })
const boom = { message: 'boom' }
const expectRevalidated = () => {
  expect(revalidatePath).toHaveBeenCalledWith('/')
  expect(revalidatePath).toHaveBeenCalledWith('/settings')
}

function setup(opts: Parameters<typeof mockServerClient>[0] = {}) {
  return mockServerClient({ user: testUser('admin@x.fr'), ...opts })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  vi.stubEnv('ALLOWED_EMAILS', 'admin@x.fr,user@x.fr')
  vi.stubEnv('ADMIN_EMAILS', 'admin@x.fr')
  vi.mocked(redirect).mockImplementation(throwRedirect)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
})

// Seules actions réservées à l'admin : droits vérifiés côté serveur, et aucune table ni rpc touchée avant.
describe.each([
  ['createDashboard', createDashboard],
  ['saveDashboard', saveDashboard],
  ['resetDashboardOrder', resetDashboardOrder],
  ['setDefaultDashboard', setDefaultDashboard],
  ['deleteDashboard', deleteDashboard],
])('%s : accès', (_name, action) => {
  it('sans session : redirige vers /login sans toucher à la base', async () => {
    const { calls, rpc, invoke } = setup({ user: null })
    await expectRedirect(action(null, valid()), '/login')
    expect(calls).toEqual([])
    expect(rpc).not.toHaveBeenCalled()
    expect(invoke).not.toHaveBeenCalled()
  })

  it.each([
    ['compte hors liste blanche', testUser('intrus@x.fr')],
    ['compte autorisé mais non admin', testUser('user@x.fr')],
  ])('%s : refusé sans toucher à la base', async (_label, user) => {
    const { calls, rpc, invoke } = setup({ user })
    expect(await action(null, valid())).toEqual(state('forbidden'))
    expect(calls).toEqual([])
    expect(rpc).not.toHaveBeenCalled()
    expect(invoke).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})

describe('createDashboard', () => {
  it.each([
    ['nom vide', ''],
    ['nom trop long', 'x'.repeat(DASHBOARD_NAME_MAX + 1)],
  ])('refuse un %s', async (_label, name) => {
    setup()
    expect(await createDashboard(null, form({ name, visibility: 'private' }))).toEqual({
      ...state('name'),
      name: name.trim(),
      visibility: 'private',
    })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('refuse une visibilité inconnue et ne renvoie que « private » ou « public » dans l’état', async () => {
    setup()
    expect(await createDashboard(null, form({ name: ' Perso ', visibility: 'secret' }))).toEqual({
      ...state('invalid'),
      name: 'Perso',
      visibility: 'private',
    })
  })

  it('remonte une erreur de comptage', async () => {
    setup({ tables: { 'synapse.dashboards': { error: boom } } })
    expect(await createDashboard(null, form({ name: 'Perso', visibility: 'private' }))).toEqual({
      ...state('save'),
      name: 'Perso',
      visibility: 'private',
    })
  })

  it('refuse au-delà du maximum de dashboards', async () => {
    const { calls } = setup({ tables: { 'synapse.dashboards': { count: DASHBOARDS_MAX } } })
    expect(await createDashboard(null, form({ name: 'Perso', visibility: 'private' }))).toEqual({
      ...state('max'),
      name: 'Perso',
      visibility: 'private',
    })
    expect(calls.some((c) => c.method === 'insert')).toBe(false)
  })

  it('remonte une erreur d’insertion', async () => {
    setup({ tables: { 'synapse.dashboards': [{ count: 1 }, { error: boom }] } })
    expect(await createDashboard(null, form({ name: 'Perso', visibility: 'private' }))).toEqual({
      ...state('save'),
      name: 'Perso',
      visibility: 'private',
    })
  })

  it('refuse quand la base tient la limite (créations simultanées)', async () => {
    setup({ tables: { 'synapse.dashboards': [{ count: DASHBOARDS_MAX - 1 }, { error: { message: 'dashboards_max' } }] } })
    expect(await createDashboard(null, form({ name: 'Perso', visibility: 'private' }))).toEqual({
      ...state('max'),
      name: 'Perso',
      visibility: 'private',
    })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('crée le dashboard, la base lui donne la dernière position', async () => {
    const { calls } = setup({ tables: { 'synapse.dashboards': [{ count: 3 }, { data: null }] } })
    expect(await createDashboard(null, form({ name: ' Perso ', visibility: 'public' }))).toEqual(state('created'))
    expectRevalidated()
    expect(calls.find((c) => c.method === 'insert')?.args[0]).toEqual({ name: 'Perso', visibility: 'public' })
  })
})

describe('saveDashboard', () => {
  const tables = () => ({
    'synapse.dashboards': { data: [{ id: ID }] },
  })

  it('refuse un id invalide', async () => {
    setup()
    expect(await saveDashboard(null, form({ id: 'nope', name: 'Perso', visibility: 'private' }))).toEqual(state('invalid'))
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('refuse un widget sensible sur un dashboard public, sans rien modifier', async () => {
    const { calls, rpc } = setup({ tables: tables() })
    expect(await saveDashboard(null, form({ id: ID, name: 'Perso', visibility: 'public', widgets: ['todo', 'mail'] }))).toEqual(
      state('sensitive'),
    )
    expect(calls.some((c) => c.method === 'update')).toBe(false)
    expect(rpc).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('refuse un dashboard introuvable (ou masqué par la RLS)', async () => {
    setup({ tables: { ...tables(), 'synapse.dashboards': { data: [] } } })
    expect(await saveDashboard(null, valid())).toEqual(state('invalid'))
  })

  it('remonte une erreur de modification', async () => {
    setup({ tables: { ...tables(), 'synapse.dashboards': { error: boom } } })
    expect(await saveDashboard(null, valid())).toEqual(state('save'))
  })

  it('remonte une erreur de set_dashboard_widgets', async () => {
    setup({ tables: tables(), rpc: { set_dashboard_widgets: { error: boom } } })
    expect(await saveDashboard(null, valid())).toEqual(state('save'))
  })

  it('enregistre les widgets dans l’ordre du formulaire', async () => {
    const { rpc, calls } = setup({ tables: tables(), rpc: { set_dashboard_widgets: { data: null } } })
    expect(
      await saveDashboard(null, form({ id: ID, name: 'Perso', visibility: 'private', widgets: ['todo', 'agenda', 'weather', 'shopping'] })),
    ).toEqual(state('saved'))
    expectRevalidated()
    expect(rpc).toHaveBeenCalledWith('set_dashboard_widgets', {
      p_dashboard: ID,
      p_widgets: ['todo', 'agenda', 'weather', 'shopping'],
    })
    expect(calls.find((c) => c.method === 'update')?.args[0]).toEqual({ name: 'Perso', visibility: 'private' })
  })

  it('ignore les ids inconnus et les doublons en gardant l’ordre', async () => {
    const { rpc } = setup({ tables: tables(), rpc: { set_dashboard_widgets: { data: null } } })
    await saveDashboard(null, form({ id: ID, name: 'Perso', visibility: 'private', widgets: ['weather', 'nope', 'todo', 'weather'] }))
    expect(rpc).toHaveBeenCalledWith('set_dashboard_widgets', { p_dashboard: ID, p_widgets: ['weather', 'todo'] })
  })

  describe('ordre modifié entre-temps', () => {
    const save = (initialWidgets: string | undefined, widgets: string[], stored: string[] | { message: string }) => {
      const t = {
        ...tables(),
        'synapse.dashboard_widgets': Array.isArray(stored) ? { data: rows(...stored) } : { error: stored },
      }
      const ctx = setup({ tables: t, rpc: { set_dashboard_widgets: { data: null } } })
      const fields: Record<string, string | string[]> = { id: ID, name: 'Perso', visibility: 'private', widgets }
      if (initialWidgets !== undefined) fields.initialWidgets = initialWidgets
      return { ...ctx, run: () => saveDashboard(null, form(fields)) }
    }

    it('ordre enregistré inchangé : applique l’ordre du formulaire', async () => {
      const { rpc, run } = save('todo,agenda', ['agenda', 'todo'], ['todo', 'agenda'])
      expect(await run()).toEqual(state('saved'))
      expect(rpc).toHaveBeenCalledWith('set_dashboard_widgets', { p_dashboard: ID, p_widgets: ['agenda', 'todo'] })
    })

    it('ordre modifié ailleurs : garde l’ordre enregistré des widgets cochés, ajoute les nouveaux à la suite', async () => {
      const { rpc, run } = save('todo,agenda', ['weather', 'todo', 'agenda'], ['agenda', 'todo'])
      expect(await run()).toEqual(state('saved'))
      expect(rpc).toHaveBeenCalledWith('set_dashboard_widgets', { p_dashboard: ID, p_widgets: ['agenda', 'todo', 'weather'] })
      expectRevalidated()
    })

    it('ordre modifié ailleurs : un widget décoché est retiré', async () => {
      const { rpc, run } = save('todo,agenda', ['todo'], ['agenda', 'todo'])
      await run()
      expect(rpc).toHaveBeenCalledWith('set_dashboard_widgets', { p_dashboard: ID, p_widgets: ['todo'] })
    })

    it('sans champ initialWidgets (formulaire ancien) : applique l’ordre du formulaire sans lire la base', async () => {
      const { rpc, calls, run } = save(undefined, ['agenda', 'todo'], ['todo', 'agenda'])
      await run()
      expect(calls.some((c) => JSON.stringify(c).includes('dashboard_widgets'))).toBe(false)
      expect(rpc).toHaveBeenCalledWith('set_dashboard_widgets', { p_dashboard: ID, p_widgets: ['agenda', 'todo'] })
    })

    it('remonte une erreur de lecture sans rien modifier', async () => {
      const { rpc, calls, run } = save('todo', ['todo'], boom)
      expect(await run()).toEqual(state('save'))
      expect(calls.some((c) => c.method === 'update')).toBe(false)
      expect(rpc).not.toHaveBeenCalled()
    })
  })
})

describe('resetDashboardOrder', () => {
  it('remonte une erreur de lecture', async () => {
    setup({ tables: { 'synapse.dashboard_widgets': { error: boom } } })
    expect(await resetDashboardOrder(null, valid())).toEqual(state('save'))
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('remonte une erreur de set_dashboard_widgets', async () => {
    setup({ tables: { 'synapse.dashboard_widgets': { data: rows('todo') } }, rpc: { set_dashboard_widgets: { error: boom } } })
    expect(await resetDashboardOrder(null, valid())).toEqual(state('save'))
  })

  it('remet les widgets présents dans l’ordre du catalogue', async () => {
    const { rpc } = setup({
      tables: { 'synapse.dashboard_widgets': { data: rows('weather', 'todo', 'mail') } },
      rpc: { set_dashboard_widgets: { data: null } },
    })
    expect(await resetDashboardOrder(null, valid())).toEqual(state('order-reset'))
    expectRevalidated()
    const expected = WIDGET_IDS.filter((w) => ['weather', 'todo', 'mail'].includes(w))
    expect(rpc).toHaveBeenCalledWith('set_dashboard_widgets', { p_dashboard: ID, p_widgets: expected })
    expect(expected).toEqual(['mail', 'todo', 'weather'])
  })
})

describe('setDefaultDashboard', () => {
  it('refuse un id invalide', async () => {
    setup()
    expect(await setDefaultDashboard(null, form({ id: 'nope' }))).toEqual(state('invalid'))
  })

  it('remonte une erreur de la fonction', async () => {
    setup({ rpc: { set_default_dashboard: { error: boom } } })
    expect(await setDefaultDashboard(null, valid())).toEqual(state('save'))
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('désigne le dashboard par défaut', async () => {
    const { rpc } = setup({ rpc: { set_default_dashboard: { data: null } } })
    expect(await setDefaultDashboard(null, valid())).toEqual(state('default'))
    expectRevalidated()
    expect(rpc).toHaveBeenCalledWith('set_default_dashboard', { p_dashboard: ID })
  })
})

describe('deleteDashboard', () => {
  it('refuse un id invalide', async () => {
    setup()
    expect(await deleteDashboard(null, form({ id: 'nope' }))).toEqual(state('invalid'))
  })

  it('remonte une erreur de lecture', async () => {
    setup({ tables: { 'synapse.dashboards': { error: boom } } })
    expect(await deleteDashboard(null, valid())).toEqual(state('save'))
  })

  it('refuse un dashboard introuvable', async () => {
    setup({ tables: { 'synapse.dashboards': { data: null } } })
    expect(await deleteDashboard(null, valid())).toEqual(state('invalid'))
  })

  it('refuse de supprimer le dashboard par défaut', async () => {
    const { calls } = setup({ tables: { 'synapse.dashboards': { data: { is_default: true } } } })
    expect(await deleteDashboard(null, valid())).toEqual(state('default-delete'))
    expect(revalidatePath).not.toHaveBeenCalled()
    expect(calls.some((c) => c.method === 'delete')).toBe(false)
  })

  it('remonte une erreur de suppression', async () => {
    setup({ tables: { 'synapse.dashboards': [{ data: { is_default: false } }, { error: boom }] } })
    expect(await deleteDashboard(null, valid())).toEqual(state('save'))
  })

  it('supprime le dashboard', async () => {
    const { calls } = setup({ tables: { 'synapse.dashboards': [{ data: { is_default: false } }, { data: null }] } })
    expect(await deleteDashboard(null, valid())).toEqual(state('deleted'))
    expectRevalidated()
    expect(calls.some((c) => c.method === 'delete')).toBe(true)
  })
})
