import { describe, it, expect, vi } from 'vitest'
import * as connectors from '@/lib/connectors'

// Le barrel importe tous les connecteurs : rien de Next ni de Supabase ne doit s'exécuter à l'import.
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('next/cache', () => ({ unstable_cache: vi.fn(), revalidateTag: vi.fn() }))

const EXPECTED = [
  ['weatherConnector', 'weather'],
  ['todoConnector', 'cairn'],
  ['shoppingConnector', 'cairn'],
  ['agendaConnector', 'google'],
  ['mailConnector', 'google'],
  ['activitiesConnector', 'garmin'],
  ['sleepConnector', 'garmin'],
  ['trendConnector', 'garmin'],
  ['dailyRecipeConnector', 'meals'],
  ['moodConnector', 'mood'],
  ['habitsConnector', 'habits'],
  ['cashConnector', 'cash'],
] as const

describe('connecteurs', () => {
  it.each(EXPECTED)('%s a l’id « %s » et une méthode read', (name, id) => {
    const connector = connectors[name]
    expect(connector.id).toBe(id)
    expect(typeof connector.read).toBe('function')
  })

  it('n’exporte que ces connecteurs', () => {
    expect(Object.keys(connectors).sort()).toEqual(EXPECTED.map(([name]) => name).sort())
  })
})
