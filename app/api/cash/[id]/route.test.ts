import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CashError, deleteEntry, updateEntry } from '@/lib/connectors/cash'
import { jsonRequest } from '@/test/next-mock'
import { DELETE, PATCH } from './route'

vi.mock('next/cache', () => ({ unstable_cache: vi.fn(), revalidateTag: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/connectors/cash', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/connectors/cash')>()),
  updateEntry: vi.fn(),
  deleteEntry: vi.fn(),
}))

const ID = '11111111-1111-4111-8111-111111111111'
const ctx = { params: Promise.resolve({ id: ID }) }

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('PATCH /api/cash/[id]', () => {
  const patch = (init: Parameters<typeof jsonRequest>[1] = { body: { amount: 3 } }) =>
    PATCH(jsonRequest(`/api/cash/${ID}`, { method: 'PATCH', ...init }), ctx)

  it('401 sans session', async () => {
    vi.mocked(updateEntry).mockRejectedValue(new CashError(401, 'Session expirée, reconnecte-toi.'))
    const res = await patch()
    expect(res.status).toBe(401)
  })

  it('415 pour un corps qui n’est pas du JSON, sans modifier', async () => {
    const res = await patch({ contentType: 'text/plain', rawBody: '{}' })
    expect(res.status).toBe(415)
    expect(updateEntry).not.toHaveBeenCalled()
  })

  it('404 avec le code gone quand la ligne a disparu', async () => {
    vi.mocked(updateEntry).mockRejectedValue(new CashError(404, 'Dépense introuvable.', 'gone'))
    const res = await patch()
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'Dépense introuvable.', code: 'gone' })
  })

  it('400 pour une saisie invalide', async () => {
    vi.mocked(updateEntry).mockRejectedValue(new CashError(400, 'Montant invalide.'))
    expect((await patch()).status).toBe(400)
  })

  it('200 : transmet l’id et le corps', async () => {
    vi.mocked(updateEntry).mockResolvedValue(undefined as never)
    const res = await patch({ body: { amount: 3, category: 'Courses' } })
    expect(updateEntry).toHaveBeenCalledWith(ID, { amount: 3, category: 'Courses' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })
})

describe('DELETE /api/cash/[id]', () => {
  // Pas de content-type exigé : respond() ne contrôle que les écritures avec corps.
  const del = () => DELETE(jsonRequest(`/api/cash/${ID}`, { method: 'DELETE', contentType: null }), ctx)

  it('200 { ok: true } et supprime la ligne de l’id', async () => {
    vi.mocked(deleteEntry).mockResolvedValue(undefined)
    const res = await del()
    expect(deleteEntry).toHaveBeenCalledWith(ID)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })

  it('401 sans session', async () => {
    vi.mocked(deleteEntry).mockRejectedValue(new CashError(401, 'Session expirée, reconnecte-toi.'))
    expect((await del()).status).toBe(401)
  })

  it('409 si le fichier n’est pas prêt', async () => {
    vi.mocked(deleteEntry).mockRejectedValue(new CashError(409, 'Fichier des dépenses non prêt.'))
    expect((await del()).status).toBe(409)
  })
})
