import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { CashError, createEntry, readCash } from '@/lib/connectors/cash'
import { jsonRequest } from '@/test/next-mock'
import { GET, POST } from './route'

// Le connecteur importe le cache Next et Supabase : simulés pour ne charger que sa logique pure.
vi.mock('next/cache', () => ({ unstable_cache: vi.fn(), revalidateTag: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/connectors/cash', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/connectors/cash')>()),
  readCash: vi.fn(),
  createEntry: vi.fn(),
}))

const entry = (id: string, date: string, amount: number, category: string) => ({ id, date, amount, category, note: null })
const BOOK = {
  title: 'Dépenses',
  entries: [
    entry('a', '2026-10-12', 10, 'Courses'),
    entry('b', '2026-10-02', 5.5, 'Transport'),
    entry('c', '2026-10-01', 4.5, 'Courses'),
    entry('d', '2026-09-30', 99, 'Loisirs'),
  ],
  categories: ['Courses', 'Transport', 'Loisirs'],
  unreadable: [],
  fetchedAt: '2026-10-15T09:00:00.000Z',
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-15T10:00:00Z'))
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
})

const get = (query = '') => GET(jsonRequest(`/api/cash${query}`, { method: 'GET', contentType: null }))

describe('GET /api/cash', () => {
  it('401 sans session, avec le code d’erreur', async () => {
    vi.mocked(readCash).mockRejectedValue(new CashError(401, 'Session expirée, reconnecte-toi.'))
    const res = await get()
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'Session expirée, reconnecte-toi.' })
  })

  it('400 pour un mois invalide, sans lire le fichier', async () => {
    const res = await get('?month=2026-13')
    expect(res.status).toBe(400)
    expect(readCash).not.toHaveBeenCalled()
  })

  it('409 si le fichier n’est pas prêt', async () => {
    vi.mocked(readCash).mockResolvedValue({ status: 'no-sheet' } as never)
    const res = await get()
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'Fichier des dépenses non prêt.' })
  })

  it('200 : mois en cours par défaut, ses dépenses seulement, totaux par catégorie', async () => {
    vi.mocked(readCash).mockResolvedValue({ status: 'ok', sheetId: 's', book: BOOK })
    const res = await get()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.month).toBe('2026-10')
    expect(body.entries.map((e: { id: string }) => e.id)).toEqual(['a', 'b', 'c'])
    expect(body.total).toBe(20)
    expect(body.byCategory).toEqual([
      { category: 'Courses', total: 14.5 },
      { category: 'Transport', total: 5.5 },
    ])
    expect(body.categories).toEqual(BOOK.categories)
  })

  it('200 : le mois demandé', async () => {
    vi.mocked(readCash).mockResolvedValue({ status: 'ok', sheetId: 's', book: BOOK })
    const body = await (await get('?month=2026-09')).json()
    expect(body.month).toBe('2026-09')
    expect(body.entries.map((e: { id: string }) => e.id)).toEqual(['d'])
  })
})

describe('POST /api/cash', () => {
  const post = (init: Parameters<typeof jsonRequest>[1]) => POST(jsonRequest('/api/cash', init))

  it('415 pour un corps qui n’est pas du JSON (garde CSRF), sans écrire', async () => {
    const res = await post({ contentType: 'text/plain', rawBody: '{"amount":1}' })
    expect(res.status).toBe(415)
    expect(await res.json()).toEqual({ error: 'Corps JSON attendu.' })
    expect(createEntry).not.toHaveBeenCalled()
  })

  it('415 sans en-tête content-type', async () => {
    const res = await post({ contentType: null, rawBody: '{}' })
    expect(res.status).toBe(415)
    expect(createEntry).not.toHaveBeenCalled()
  })

  it('un JSON invalide arrive comme null à la validation', async () => {
    vi.mocked(createEntry).mockRejectedValue(new CashError(400, 'Date invalide.'))
    const res = await post({ rawBody: '{' })
    expect(createEntry).toHaveBeenCalledWith(null)
    expect(res.status).toBe(400)
  })

  it('400 avec le message de CashError', async () => {
    vi.mocked(createEntry).mockRejectedValue(new CashError(400, 'Date invalide.'))
    const res = await post({ body: { date: 'x' } })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Date invalide.' })
  })

  it('401 avec le code reauth quand Google demande une nouvelle autorisation', async () => {
    vi.mocked(createEntry).mockRejectedValue(new CashError(401, 'Reconnecte Google.', 'reauth'))
    const res = await post({ body: {} })
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'Reconnecte Google.', code: 'reauth' })
  })

  it('502 pour une erreur inattendue, sans fuite du message', async () => {
    vi.mocked(createEntry).mockRejectedValue(new Error('secret interne'))
    const res = await post({ body: {} })
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ error: 'Google Sheets ne répond pas, réessaie.' })
  })

  it('200 { ok: true } quand rien n’est renvoyé', async () => {
    vi.mocked(createEntry).mockResolvedValue(undefined as never)
    const body = { date: '2026-10-15', amount: 12, category: 'Courses', note: null }
    const res = await post({ body })
    expect(createEntry).toHaveBeenCalledWith(body)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })
})
