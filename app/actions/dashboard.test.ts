import { describe, it, expect, vi, beforeEach } from 'vitest'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { invalidateCash } from '@/lib/connectors/cash'
import { WIDGET_IDS, type WidgetId } from '@/lib/dashboard'
import { mockServerClient, testUser } from '@/test/supabase-mock'
import { refreshWidget, saveWidgetOrder } from './dashboard'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
// Le connecteur cash charge Google/Sheets : inutile ici, seul l'appel compte.
vi.mock('@/lib/connectors/cash', () => ({ invalidateCash: vi.fn() }))

const DASHBOARD = '11111111-1111-4111-8111-111111111111'
const ORDER_ERROR = { error: 'Impossible d’enregistrer l’ordre.' }
const rows = (...ids: string[]) => ids.map((widget_id) => ({ widget_id }))

function setup(opts: Parameters<typeof mockServerClient>[0] = {}) {
  return mockServerClient({ user: testUser(), ...opts })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('saveWidgetOrder', () => {
  it('refuse un dashboard qui n’est pas un UUID, sans appeler Supabase', async () => {
    expect(await saveWidgetOrder('nope', ['mail'])).toEqual({ error: 'Dashboard invalide.' })
    expect(createClient).not.toHaveBeenCalled()
  })

  it('refuse un ordre qui n’est pas une liste de chaînes', async () => {
    expect(await saveWidgetOrder(DASHBOARD, 'mail' as never)).toEqual({ error: 'Ordre invalide.' })
    expect(await saveWidgetOrder(DASHBOARD, ['mail', 3] as never)).toEqual({ error: 'Ordre invalide.' })
    expect(createClient).not.toHaveBeenCalled()
  })

  it('refuse sans session', async () => {
    setup({ user: null })
    expect(await saveWidgetOrder(DASHBOARD, ['mail'])).toEqual({ error: 'Session expirée.' })
  })

  it('remonte une erreur de lecture des widgets', async () => {
    const { rpc } = setup({ tables: { 'synapse.dashboard_widgets': { error: { message: 'boom' } } } })
    expect(await saveWidgetOrder(DASHBOARD, ['mail'])).toEqual(ORDER_ERROR)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('refuse un dashboard sans widget visible (dashboard d’un autre compte masqué par la RLS)', async () => {
    const { rpc } = setup({ tables: { 'synapse.dashboard_widgets': { data: [] } } })
    expect(await saveWidgetOrder(DASHBOARD, ['mail'])).toEqual(ORDER_ERROR)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('remonte une erreur de la fonction set_dashboard_widgets', async () => {
    setup({
      tables: { 'synapse.dashboard_widgets': { data: rows('mail', 'todo') } },
      rpc: { set_dashboard_widgets: { error: { message: 'boom' } } },
    })
    expect(await saveWidgetOrder(DASHBOARD, ['todo', 'mail'])).toEqual(ORDER_ERROR)
  })

  it('met les ids demandés en tête, ignore les inconnus et les absents, garde les omis en fin', async () => {
    const { rpc } = setup({
      tables: { 'synapse.dashboard_widgets': { data: rows('mail', 'todo', 'weather') } },
      rpc: { set_dashboard_widgets: { data: null } },
    })
    // 'mood' n'est pas sur ce dashboard, 'inconnu' n'est pas au catalogue, 'mail' est omis.
    expect(WIDGET_IDS).toContain('mood')
    expect(await saveWidgetOrder(DASHBOARD, ['weather', 'mood', 'inconnu', 'todo'])).toEqual({})
    expect(rpc).toHaveBeenCalledWith('set_dashboard_widgets', {
      p_dashboard: DASHBOARD,
      p_widgets: ['weather', 'todo', 'mail'],
    })
  })
})

describe('refreshWidget', () => {
  it('refuse un widget inconnu, sans appeler Supabase', async () => {
    expect(await refreshWidget('inconnu' as WidgetId)).toEqual({ error: 'Widget inconnu.' })
    expect(createClient).not.toHaveBeenCalled()
  })

  it('refuse sans session', async () => {
    setup({ user: null })
    expect(await refreshWidget('mail')).toEqual({ error: 'Session expirée.' })
  })

  it('remonte l’échec de la synchro Google pour les mails', async () => {
    setup({ functions: { 'synapse-google-sync': { error: { message: 'boom' } } } })
    expect(await refreshWidget('mail')).toEqual({ error: 'Synchro Google impossible.' })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('relance la synchro Google pour l’agenda puis revalide', async () => {
    const { invoke } = setup({ functions: { 'synapse-google-sync': { data: {} } } })
    expect(await refreshWidget('agenda')).toEqual({})
    expect(invoke).toHaveBeenCalledWith('synapse-google-sync', { method: 'POST' })
    expect(revalidatePath).toHaveBeenCalledWith('/')
  })

  it('vide le cache des dépenses de l’utilisateur', async () => {
    const { invoke } = setup()
    expect(await refreshWidget('cash')).toEqual({})
    expect(invalidateCash).toHaveBeenCalledWith('u1')
    expect(invoke).not.toHaveBeenCalled()
  })

  it('relit simplement les autres widgets', async () => {
    const { invoke } = setup()
    expect(await refreshWidget('weather')).toEqual({})
    expect(invoke).not.toHaveBeenCalled()
    expect(invalidateCash).not.toHaveBeenCalled()
    expect(revalidatePath).toHaveBeenCalledWith('/')
  })
})
