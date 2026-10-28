import { describe, it, expect, vi, beforeEach } from 'vitest'
import { headers } from 'next/headers'
import { verifyAuthenticationResponse } from '@simplewebauthn/server'
import { CHALLENGE_COOKIE, UNLOCK_COOKIE, isUnlocked, issueChallengeCookie } from '@/lib/lock/token'
import { mockServerClient, testUser, type MockResult } from '@/test/supabase-mock'
import { jsonRequest } from '@/test/next-mock'
import { POST } from './route'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('next/headers', () => ({ headers: vi.fn() }))
vi.mock('@simplewebauthn/server', () => ({ verifyAuthenticationResponse: vi.fn() }))

const boom = { message: 'boom' }
const PASSKEY = { id: 'pk1', public_key: 'AQI', counter: 3, transports: ['internal'] }
// La configuration est lue par le vrai readLockConfig, sur la table `lock`.
const LOCK: MockResult = { data: { idle_minutes: 5, epoch: 2 } }

function setup(opts: { user?: ReturnType<typeof testUser> | null; lock?: MockResult; passkeys?: MockResult[] } = {}) {
  return mockServerClient({
    user: opts.user === undefined ? testUser() : opts.user,
    tables: { 'synapse.lock': opts.lock ?? LOCK, 'synapse.lock_passkeys': opts.passkeys ?? [{ data: PASSKEY }, { data: null }] },
  })
}

async function cookieFor(purpose: 'register' | 'authenticate', userId = 'u1') {
  const { name, value } = await issueChallengeCookie(purpose, userId, 'chal')
  return `${name}=${value}`
}

async function post(init: { body?: unknown; rawBody?: string; cookie?: string | null } = {}) {
  const cookie = init.cookie === undefined ? await cookieFor('authenticate') : (init.cookie ?? undefined)
  return POST(jsonRequest('/api/lock/passkey/auth-verify', { body: { response: { id: 'cred' } }, ...init, cookie }))
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('SYNAPSE_LOCK_SECRET', 'a'.repeat(32))
  vi.mocked(headers).mockResolvedValue(new Headers({ host: 'localhost:3000' }) as never)
  vi.mocked(verifyAuthenticationResponse).mockResolvedValue({ verified: true, authenticationInfo: { newCounter: 8 } } as never)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('POST /api/lock/passkey/auth-verify', () => {
  it('401 sans session', async () => {
    setup({ user: null })
    expect((await post()).status).toBe(401)
    expect(verifyAuthenticationResponse).not.toHaveBeenCalled()
  })

  it.each([
    ['JSON invalide', { rawBody: '{' }],
    ['réponse WebAuthn absente', { body: {} }],
    ['réponse sans id', { body: { response: {} } }],
  ])('400 pour %s', async (_label, init) => {
    setup()
    const res = await post(init)
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Requête invalide.' })
  })

  it.each([
    ['sans cookie de défi', async () => null],
    ['défi émis pour un autre utilisateur', () => cookieFor('authenticate', 'u2')],
    ['défi d’enregistrement (autre usage)', () => cookieFor('register')],
  ])('400 %s, sans vérifier', async (_label, cookie) => {
    setup()
    const res = await post({ cookie: await cookie() })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Demande expirée, recommence.' })
    expect(verifyAuthenticationResponse).not.toHaveBeenCalled()
  })

  it('400 si le verrouillage n’est pas activé', async () => {
    setup({ lock: { data: null } })
    const res = await post()
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Le verrouillage n’est pas activé.' })
  })

  // La route cherche l'empreinte par `credential_id` seul : c'est la policy RLS de
  // `synapse.lock_passkeys` (lecture par le propriétaire, migration 0009) qui la limite à
  // l'utilisateur connecté. Le faux client ne l'applique pas, ce test ne la prouve donc pas.
  it('400 pour une empreinte inconnue', async () => {
    setup({ passkeys: [{ data: null }] })
    const res = await post()
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Empreinte inconnue.' })
    expect(verifyAuthenticationResponse).not.toHaveBeenCalled()
  })

  it('401 si la lecture de l’empreinte échoue', async () => {
    setup({ passkeys: [{ error: boom }] })
    const res = await post()
    expect(res.status).toBe(401)
    expect(res.cookies.get(UNLOCK_COOKIE)).toBeUndefined()
  })

  it('401 si la signature n’est pas vérifiée', async () => {
    setup()
    vi.mocked(verifyAuthenticationResponse).mockResolvedValue({ verified: false } as never)
    const res = await post()
    expect(res.status).toBe(401)
    expect(res.cookies.get(UNLOCK_COOKIE)).toBeUndefined()
  })

  it('401 si la vérification lève', async () => {
    setup()
    vi.mocked(verifyAuthenticationResponse).mockRejectedValue(new Error('compteur en recul'))
    const res = await post()
    expect(res.status).toBe(401)
    expect(res.cookies.get(UNLOCK_COOKIE)).toBeUndefined()
  })

  it('200 : déverrouille, efface le défi, enregistre le nouveau compteur', async () => {
    const { calls } = setup()
    const res = await post()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(verifyAuthenticationResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedChallenge: 'chal',
        expectedOrigin: 'http://localhost:3000',
        expectedRPID: 'localhost',
        requireUserVerification: true,
        credential: expect.objectContaining({ id: 'cred', counter: 3, publicKey: new Uint8Array([1, 2]) }),
      }),
    )
    expect(await isUnlocked(res.cookies.get(UNLOCK_COOKIE)?.value, 'u1', 2)).toBe(true)
    expect(res.cookies.get(CHALLENGE_COOKIE)).toMatchObject({ value: '', maxAge: 0 })
    expect(calls.find((c) => c.method === 'update')?.args[0]).toMatchObject({ counter: 8 })
    expect(calls).toContainEqual(expect.objectContaining({ method: 'eq', args: ['id', 'pk1'] }))
  })

  it('200 même si la mise à jour du compteur échoue (seulement journalisée)', async () => {
    setup({ passkeys: [{ data: PASSKEY }, { error: boom }] })
    const res = await post()
    expect(res.status).toBe(200)
    expect(await isUnlocked(res.cookies.get(UNLOCK_COOKIE)?.value, 'u1', 2)).toBe(true)
    expect(console.error).toHaveBeenCalled()
  })
})
