import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CashError, runMigration } from '@/lib/connectors/cash'
import { jsonRequest } from '@/test/next-mock'
import { POST } from './route'

vi.mock('next/cache', () => ({ unstable_cache: vi.fn(), revalidateTag: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/connectors/cash', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/connectors/cash')>()),
  runMigration: vi.fn(),
}))

const post = (init: Parameters<typeof jsonRequest>[1] = { body: {} }) => POST(jsonRequest('/api/cash/migration', init))

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('POST /api/cash/migration', () => {
  it('transmet les corrections telles quelles et renvoie le résultat', async () => {
    const result = { status: 'already-migrated' }
    vi.mocked(runMigration).mockResolvedValue(result as never)
    const corrections = { '4': { date: '2026-10-01' } }
    const res = await post({ body: { corrections } })
    expect(runMigration).toHaveBeenCalledWith(corrections)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(result)
  })

  it.each([
    ['absentes', {}],
    ['une chaîne', { corrections: 'x' }],
    ['null', { corrections: null }],
  ])('corrections %s : migration sans correction', async (_label, body) => {
    vi.mocked(runMigration).mockResolvedValue({ errors: [] })
    await post({ body })
    expect(runMigration).toHaveBeenCalledWith({})
  })

  it('401 sans session', async () => {
    vi.mocked(runMigration).mockRejectedValue(new CashError(401, 'Session expirée, reconnecte-toi.'))
    expect((await post()).status).toBe(401)
  })

  it('409 si le fichier n’est pas prêt', async () => {
    vi.mocked(runMigration).mockRejectedValue(new CashError(409, 'Fichier des dépenses non prêt.'))
    expect((await post()).status).toBe(409)
  })

  it('415 pour un corps qui n’est pas du JSON, sans migrer', async () => {
    const res = await post({ contentType: 'text/plain', rawBody: '{}' })
    expect(res.status).toBe(415)
    expect(runMigration).not.toHaveBeenCalled()
  })
})
