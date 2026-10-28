import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createClient } from '@/lib/supabase/server'
import { readRecipe } from '@/lib/recipes'
import { mockSupabase } from '@/test/supabase-mock'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))

const ID = '11111111-1111-4111-8111-111111111111'
const RECIPE = { id: ID, title: 'Ratatouille', ingredients: ['Aubergine'], steps: ['Cuire'], source_url: 'https://x.test' }

function setup(result: { data?: unknown; error?: unknown }) {
  const m = mockSupabase({ tables: { recipes: result } })
  vi.mocked(createClient).mockResolvedValue(m.client as never)
  return m
}

beforeEach(() => {
  vi.mocked(createClient).mockReset()
})

describe('readRecipe', () => {
  it('rend null sans toucher à Supabase quand l’id n’est pas un UUID', async () => {
    expect(await readRecipe('pas-un-uuid')).toBeNull()
    expect(await readRecipe('')).toBeNull()
    expect(createClient).not.toHaveBeenCalled()
  })

  it('rend la recette, filtrée par id dans synapse.recipes', async () => {
    const m = setup({ data: RECIPE })
    expect(await readRecipe(ID)).toEqual(RECIPE)
    expect(m.calls).toContainEqual({ schema: 'synapse', table: 'recipes', method: 'eq', args: ['id', ID] })
  })

  it('rend null pour un id inconnu', async () => {
    setup({ data: null })
    expect(await readRecipe(ID)).toBeNull()
  })

  it('lève l’erreur Supabase', async () => {
    const error = new Error('db down')
    setup({ error })
    await expect(readRecipe(ID)).rejects.toBe(error)
  })
})
