import { describe, it, expect, vi, beforeEach } from 'vitest'
import { headers } from 'next/headers'
import { generateAuthenticationOptions } from '@simplewebauthn/server'
import { CHALLENGE_COOKIE, readChallenge } from '@/lib/lock/token'
import { mockServerClient, testUser } from '@/test/supabase-mock'
import { POST } from './route'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('next/headers', () => ({ headers: vi.fn() }))
vi.mock('@simplewebauthn/server', () => ({ generateAuthenticationOptions: vi.fn() }))

const boom = { message: 'boom' }

function setup(opts: Parameters<typeof mockServerClient>[0] = {}) {
  return mockServerClient({ user: testUser(), ...opts })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('SYNAPSE_LOCK_SECRET', 'a'.repeat(32))
  vi.mocked(headers).mockResolvedValue(new Headers({ host: 'localhost:3000' }) as never)
  vi.mocked(generateAuthenticationOptions).mockResolvedValue({ challenge: 'chal', rpId: 'localhost' } as never)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('POST /api/lock/passkey/auth-options', () => {
  it('401 sans session', async () => {
    setup({ user: null })
    expect((await POST()).status).toBe(401)
    expect(generateAuthenticationOptions).not.toHaveBeenCalled()
  })

  it('500 si la lecture des empreintes échoue', async () => {
    setup({ tables: { 'synapse.lock_passkeys': { error: boom } } })
    const res = await POST()
    expect(res.status).toBe(500)
    expect(res.cookies.get(CHALLENGE_COOKIE)).toBeUndefined()
  })

  it.each([[[]], [null]])('404 sans empreinte enregistrée (%j)', async (data) => {
    setup({ tables: { 'synapse.lock_passkeys': { data } } })
    const res = await POST()
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'Aucune empreinte enregistrée.' })
    expect(generateAuthenticationOptions).not.toHaveBeenCalled()
  })

  it('200 : options WebAuthn et défi lié à l’utilisateur dans un cookie', async () => {
    setup({ tables: { 'synapse.lock_passkeys': { data: [{ credential_id: 'cred', transports: ['internal'] }] } } })
    const res = await POST()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ challenge: 'chal', rpId: 'localhost' })
    expect(generateAuthenticationOptions).toHaveBeenCalledWith({
      rpID: 'localhost',
      userVerification: 'required',
      allowCredentials: [{ id: 'cred', transports: ['internal'] }],
    })
    const cookie = res.cookies.get(CHALLENGE_COOKIE)
    expect(cookie).toMatchObject({ httpOnly: true, maxAge: 300 })
    expect(await readChallenge(cookie?.value, 'authenticate', 'u1')).toBe('chal')
    expect(await readChallenge(cookie?.value, 'register', 'u1')).toBeNull()
    expect(await readChallenge(cookie?.value, 'authenticate', 'u2')).toBeNull()
  })

  it('500 si WebAuthn lève', async () => {
    setup({ tables: { 'synapse.lock_passkeys': { data: [{ credential_id: 'cred', transports: [] }] } } })
    vi.mocked(generateAuthenticationOptions).mockRejectedValue(new Error('boom'))
    expect((await POST()).status).toBe(500)
  })
})

