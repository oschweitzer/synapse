import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CashError, addCategory } from '@/lib/connectors/cash'
import { jsonRequest } from '@/test/next-mock'
import { POST } from './route'

vi.mock('next/cache', () => ({ unstable_cache: vi.fn(), revalidateTag: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/connectors/cash', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/connectors/cash')>()),
  addCategory: vi.fn(),
}))

const post = (init: Parameters<typeof jsonRequest>[1] = { body: { name: 'Courses' } }) =>
  POST(jsonRequest('/api/cash/categories', init))

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('POST /api/cash/categories', () => {
  it('200 : ajoute la catégorie et renvoie son nom', async () => {
    vi.mocked(addCategory).mockResolvedValue('Courses')
    const res = await post()
    expect(addCategory).toHaveBeenCalledWith('Courses')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ name: 'Courses' })
  })

  it('un corps sans nom arrive comme undefined à la validation', async () => {
    vi.mocked(addCategory).mockRejectedValue(new CashError(400, 'Catégorie invalide.'))
    const res = await post({ body: {} })
    expect(addCategory).toHaveBeenCalledWith(undefined)
    expect(res.status).toBe(400)
  })

  it('401 sans session', async () => {
    vi.mocked(addCategory).mockRejectedValue(new CashError(401, 'Session expirée, reconnecte-toi.'))
    expect((await post()).status).toBe(401)
  })

  it('415 pour un corps qui n’est pas du JSON, sans écrire', async () => {
    const res = await post({ contentType: 'text/plain', rawBody: '{"name":"x"}' })
    expect(res.status).toBe(415)
    expect(addCategory).not.toHaveBeenCalled()
  })
})
