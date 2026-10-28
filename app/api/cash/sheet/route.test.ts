import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CashError, linkSheet, unlinkSheet } from '@/lib/connectors/cash'
import { jsonRequest } from '@/test/next-mock'
import { DELETE, PUT } from './route'

vi.mock('next/cache', () => ({ unstable_cache: vi.fn(), revalidateTag: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/connectors/cash', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/connectors/cash')>()),
  linkSheet: vi.fn(),
  unlinkSheet: vi.fn(),
}))

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('PUT /api/cash/sheet', () => {
  const put = (init: Parameters<typeof jsonRequest>[1] = { body: { id: 'sheet-1' } }) =>
    PUT(jsonRequest('/api/cash/sheet', { method: 'PUT', ...init }))

  it('200 : lie le fichier choisi et renvoie son titre', async () => {
    vi.mocked(linkSheet).mockResolvedValue({ title: 'Dépenses' } as never)
    const res = await put()
    expect(linkSheet).toHaveBeenCalledWith('sheet-1')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ title: 'Dépenses' })
  })

  it('400 pour un fichier invalide', async () => {
    vi.mocked(linkSheet).mockRejectedValue(new CashError(400, 'Fichier invalide.'))
    const res = await put({ body: {} })
    expect(linkSheet).toHaveBeenCalledWith(undefined)
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Fichier invalide.' })
  })

  it('409 quand Google n’est pas connecté', async () => {
    vi.mocked(linkSheet).mockRejectedValue(new CashError(409, 'Connecte Google dans les réglages.'))
    expect((await put()).status).toBe(409)
  })

  it('401 sans session', async () => {
    vi.mocked(linkSheet).mockRejectedValue(new CashError(401, 'Session expirée, reconnecte-toi.'))
    expect((await put()).status).toBe(401)
  })

  it('415 pour un corps qui n’est pas du JSON, sans lier', async () => {
    const res = await put({ contentType: 'text/plain', rawBody: '{"id":"x"}' })
    expect(res.status).toBe(415)
    expect(linkSheet).not.toHaveBeenCalled()
  })
})

describe('DELETE /api/cash/sheet', () => {
  const del = () => DELETE(jsonRequest('/api/cash/sheet', { method: 'DELETE', contentType: null }))

  it('200 { ok: true } : oublie le fichier', async () => {
    vi.mocked(unlinkSheet).mockResolvedValue(undefined)
    const res = await del()
    expect(unlinkSheet).toHaveBeenCalledOnce()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })

  it('500 quand l’écriture échoue côté serveur', async () => {
    vi.mocked(unlinkSheet).mockRejectedValue(new CashError(500, 'Impossible d’oublier le fichier.'))
    expect((await del()).status).toBe(500)
  })
})
