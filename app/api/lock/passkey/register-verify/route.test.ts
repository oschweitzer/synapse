import { describe, it, expect, vi, beforeEach } from 'vitest'
import { headers } from 'next/headers'
import { verifyRegistrationResponse } from '@simplewebauthn/server'
import { CHALLENGE_COOKIE, issueChallengeCookie } from '@/lib/lock/token'
import { toBase64Url } from '@/lib/lock/webauthn'
import { mockServerClient, testUser } from '@/test/supabase-mock'
import { jsonRequest } from '@/test/next-mock'
import { POST } from './route'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('next/headers', () => ({ headers: vi.fn() }))
vi.mock('@simplewebauthn/server', () => ({ verifyRegistrationResponse: vi.fn() }))

const PUBLIC_KEY = new Uint8Array([1, 2])
const VERIFIED = {
  verified: true,
  registrationInfo: { credential: { id: 'cred', publicKey: PUBLIC_KEY, counter: 0, transports: ['internal'] } },
}

function setup(opts: Parameters<typeof mockServerClient>[0] = {}) {
  return mockServerClient({ user: testUser(), tables: { 'synapse.lock_passkeys': { data: null } }, ...opts })
}

async function cookieFor(purpose: 'register' | 'authenticate', userId = 'u1') {
  const { name, value } = await issueChallengeCookie(purpose, userId, 'chal')
  return `${name}=${value}`
}

async function post(init: { body?: unknown; rawBody?: string; cookie?: string | null } = {}) {
  const cookie = init.cookie === undefined ? await cookieFor('register') : (init.cookie ?? undefined)
  return POST(jsonRequest('/api/lock/passkey/register-verify', { body: { response: { id: 'cred' } }, ...init, cookie }))
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('SYNAPSE_LOCK_SECRET', 'a'.repeat(32))
  vi.mocked(headers).mockResolvedValue(new Headers({ host: 'localhost:3000' }) as never)
  vi.mocked(verifyRegistrationResponse).mockResolvedValue(VERIFIED as never)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('POST /api/lock/passkey/register-verify', () => {
  it('401 sans session', async () => {
    setup({ user: null })
    expect((await post()).status).toBe(401)
    expect(verifyRegistrationResponse).not.toHaveBeenCalled()
  })

  it.each([
    ['JSON invalide', { rawBody: '{' }],
    ['réponse WebAuthn absente', { body: { label: 'Téléphone' } }],
  ])('400 pour %s', async (_label, init) => {
    setup()
    const res = await post(init)
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Requête invalide.' })
  })

  it.each([
    ['sans cookie de défi', async () => null],
    ['défi illisible', async () => 'synapse_lock_challenge=forge.abc'],
    ['défi émis pour un autre utilisateur', () => cookieFor('register', 'u2')],
    ['défi d’authentification (autre usage)', () => cookieFor('authenticate')],
  ])('400 %s, sans vérifier ni écrire', async (_label, cookie) => {
    const { calls } = setup()
    const res = await post({ cookie: await cookie() })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Demande expirée, recommence.' })
    expect(verifyRegistrationResponse).not.toHaveBeenCalled()
    expect(calls).toEqual([])
  })

  it('400 si l’empreinte n’est pas vérifiée', async () => {
    const { calls } = setup()
    vi.mocked(verifyRegistrationResponse).mockResolvedValue({ verified: false } as never)
    const res = await post()
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Empreinte non reconnue.' })
    expect(calls).toEqual([])
  })

  it('400 si la vérification lève', async () => {
    setup()
    vi.mocked(verifyRegistrationResponse).mockRejectedValue(new Error('origine inattendue'))
    expect((await post()).status).toBe(400)
  })

  it('400 si l’insertion échoue', async () => {
    setup({ tables: { 'synapse.lock_passkeys': { error: { message: 'boom' } } } })
    const res = await post()
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Enregistrement impossible, réessaie.' })
    expect(res.cookies.get(CHALLENGE_COOKIE)).toBeUndefined()
  })

  it('vérifie avec le défi du cookie et l’origine de la requête', async () => {
    setup()
    await post()
    expect(verifyRegistrationResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedChallenge: 'chal',
        expectedOrigin: 'http://localhost:3000',
        expectedRPID: 'localhost',
        requireUserVerification: true,
      }),
    )
  })

  it('200 : enregistre la clé en base64url, avec un libellé rogné, et efface le défi', async () => {
    const { calls } = setup()
    const res = await post({ body: { response: { id: 'cred' }, label: `  ${'x'.repeat(80)}  ` } })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(calls.find((c) => c.method === 'insert')?.args[0]).toEqual({
      credential_id: 'cred',
      public_key: toBase64Url(PUBLIC_KEY),
      counter: 0,
      transports: ['internal'],
      label: 'x'.repeat(60),
    })
    expect(res.cookies.get(CHALLENGE_COOKIE)).toMatchObject({ value: '', maxAge: 0 })
  })

  it.each([
    ['sans libellé', {}],
    ['libellé blanc', { label: '   ' }],
    ['libellé qui n’est pas une chaîne', { label: 42 }],
  ])('libellé par défaut « Cet appareil » : %s', async (_label, extra) => {
    const { calls } = setup()
    await post({ body: { response: { id: 'cred' }, ...extra } })
    expect(calls.find((c) => c.method === 'insert')?.args[0]).toMatchObject({ label: 'Cet appareil' })
  })
})
