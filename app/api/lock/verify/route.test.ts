import { describe, it, expect, vi, beforeEach } from 'vitest'
import { attemptCode } from '@/lib/lock/server'
import { UNLOCK_COOKIE, isUnlocked } from '@/lib/lock/token'
import { mockServerClient, testUser } from '@/test/supabase-mock'
import { jsonRequest } from '@/test/next-mock'
import { POST } from './route'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/lock/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/lock/server')>()),
  attemptCode: vi.fn(),
}))

function setup(user: ReturnType<typeof testUser> | null = testUser()) {
  mockServerClient({ user })
}

const post = (init: Parameters<typeof jsonRequest>[1] = { body: { code: 'secret' } }) =>
  POST(jsonRequest('/api/lock/verify', init))

beforeEach(() => {
  vi.stubEnv('SYNAPSE_LOCK_SECRET', 'a'.repeat(32))
  setup()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('POST /api/lock/verify', () => {
  it('401 sans session, sans tester le code', async () => {
    setup(null)
    const res = await post()
    expect(res.status).toBe(401)
    expect(attemptCode).not.toHaveBeenCalled()
  })

  it.each([
    ['JSON invalide', { rawBody: '{' }],
    ['code absent', { body: {} }],
    ['code qui n’est pas une chaîne', { body: { code: 123 } }],
    ['code vide', { body: { code: '' } }],
    ['code de 257 caractères', { body: { code: 'x'.repeat(257) } }],
  ])('400 pour %s, sans tester le code', async (_label, init) => {
    const res = await post(init)
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Saisis ton code.' })
    expect(attemptCode).not.toHaveBeenCalled()
  })

  it('401 pour un code faux, sans déconnexion', async () => {
    vi.mocked(attemptCode).mockResolvedValue({ ok: false, reason: 'wrong' })
    const res = await post()
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'Code incorrect.', signedOut: false })
    expect(res.cookies.get(UNLOCK_COOKIE)).toBeUndefined()
  })

  it('429 pendant la temporisation', async () => {
    vi.mocked(attemptCode).mockResolvedValue({ ok: false, reason: 'throttled', retryAfter: 30 })
    const res = await post()
    expect(res.status).toBe(429)
    expect((await res.json()).error).toContain('30 s')
  })

  it('401 avec signedOut après trop d’échecs', async () => {
    vi.mocked(attemptCode).mockResolvedValue({ ok: false, reason: 'signed-out' })
    const res = await post()
    expect(res.status).toBe(401)
    expect((await res.json()).signedOut).toBe(true)
  })

  it('500 si la vérification lève', async () => {
    vi.mocked(attemptCode).mockRejectedValue(new Error('base indisponible'))
    const res = await post()
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'Vérification impossible, réessaie.' })
  })

  it('200 : pose un cookie de déverrouillage valable pour l’utilisateur et l’époque', async () => {
    vi.mocked(attemptCode).mockResolvedValue({ ok: true, config: { idleMinutes: 5, epoch: 2 } })
    const res = await post()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(attemptCode).toHaveBeenCalledWith(expect.anything(), 'secret')
    const cookie = res.cookies.get(UNLOCK_COOKIE)
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'lax', maxAge: 300 })
    expect(await isUnlocked(cookie?.value, 'u1', 2)).toBe(true)
    expect(await isUnlocked(cookie?.value, 'u1', 3)).toBe(false)
    expect(await isUnlocked(cookie?.value, 'u2', 2)).toBe(false)
  })
})
