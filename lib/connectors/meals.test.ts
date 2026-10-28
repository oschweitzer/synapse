import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createClient } from '@/lib/supabase/server'
import { dailyRecipeConnector } from '@/lib/connectors/meals'
import { mockSupabase, type MockResult } from '@/test/supabase-mock'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))

const RECIPE_ID = '11111111-1111-4111-8111-111111111111'
const RECIPE = { id: RECIPE_ID, title: 'Ratatouille', ingredients: ['Aubergine'], source_url: 'https://x.test' }

function setup(opts: { rpc?: MockResult; recipes?: MockResult; settings?: MockResult }) {
  const m = mockSupabase({
    rpc: { pick_daily_recipe: opts.rpc ?? { data: RECIPE_ID } },
    tables: { recipes: opts.recipes ?? { data: RECIPE }, settings: opts.settings ?? { data: null } },
  })
  vi.mocked(createClient).mockResolvedValue(m.client as never)
  return m
}

beforeEach(() => {
  vi.mocked(createClient).mockReset()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-01-15T10:00:00Z'))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('dailyRecipeConnector', () => {
  it('a l’id « meals »', () => {
    expect(dailyRecipeConnector.id).toBe('meals')
  })

  it('tire la recette du jour, au jour de Paris', async () => {
    const m = setup({})
    await dailyRecipeConnector.read('u1')
    expect(m.rpc).toHaveBeenCalledWith('pick_daily_recipe', { p_day: '2026-01-15' })
  })

  it('passe au lendemain après minuit à Paris', async () => {
    // 23:30Z le 15 = 00:30 le 16 à Paris.
    vi.setSystemTime(new Date('2026-01-15T23:30:00Z'))
    const m = setup({})
    await dailyRecipeConnector.read('u1')
    expect(m.rpc).toHaveBeenCalledWith('pick_daily_recipe', { p_day: '2026-01-16' })
  })

  it('rend « empty » quand aucune recette n’est tirée, sans lire la table', async () => {
    const m = setup({ rpc: { data: null } })
    expect(await dailyRecipeConnector.read('u1')).toEqual({ data: { status: 'empty' }, syncedAt: null })
    expect(m.calls.some((c) => c.table === 'recipes')).toBe(false)
  })

  it('rend la recette sans liste de courses quand aucune n’est choisie', async () => {
    const m = setup({})
    expect(await dailyRecipeConnector.read('u1')).toEqual({
      data: { status: 'ok', recipe: RECIPE, hasShoppingList: false },
      syncedAt: null,
    })
    expect(m.calls).toContainEqual(expect.objectContaining({ table: 'recipes', method: 'eq', args: ['id', RECIPE_ID] }))
  })

  it('signale la liste de courses quand elle est choisie dans les réglages', async () => {
    setup({ settings: { data: { cairn_shopping_checklist_id: 'shop-1' } } })
    expect((await dailyRecipeConnector.read('u1')).data).toMatchObject({ status: 'ok', hasShoppingList: true })
  })

  it('lève l’erreur de pick_daily_recipe', async () => {
    const error = new Error('rpc down')
    setup({ rpc: { error } })
    await expect(dailyRecipeConnector.read('u1')).rejects.toBe(error)
  })

  it('lève l’erreur de lecture de la recette', async () => {
    const error = new Error('recipes down')
    setup({ recipes: { error } })
    await expect(dailyRecipeConnector.read('u1')).rejects.toBe(error)
  })

  it('lève l’erreur de lecture des réglages', async () => {
    const error = new Error('settings down')
    setup({ settings: { error } })
    await expect(dailyRecipeConnector.read('u1')).rejects.toBe(error)
  })
})
