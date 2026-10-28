import { describe, it, expect, vi, beforeEach } from 'vitest'
import { COOKIE_PATH, STATE_COOKIE, VERIFIER_COOKIE } from '@/lib/google/oauth'
import { mockServerClient, testUser } from '@/test/supabase-mock'
import { jsonRequest } from '@/test/next-mock'
import { GET } from './route'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))

function setup(user: ReturnType<typeof testUser> | null = testUser()) {
  mockServerClient({ user })
}

const call = () => GET(jsonRequest('/api/google/connect', { method: 'GET', contentType: null }))

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('SYNAPSE_GOOGLE_CLIENT_ID', '123-abc.apps.googleusercontent.com')
  vi.stubEnv('SYNAPSE_GOOGLE_CLIENT_SECRET', 'secret')
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', '')
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('GET /api/google/connect', () => {
  it('sans session : redirige vers /login et ne pose aucun cookie', async () => {
    setup(null)
    const res = await call()
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe('http://localhost:3000/login')
    expect(res.cookies.getAll()).toEqual([])
  })

  it('sans configuration Google : redirige vers ?google=config, sans cookie', async () => {
    setup()
    vi.stubEnv('SYNAPSE_GOOGLE_CLIENT_ID', '')
    const res = await call()
    expect(res.headers.get('location')).toBe('http://localhost:3000/settings?google=config')
    expect(res.cookies.getAll()).toEqual([])
  })

  it('redirige vers Google avec PKCE et l’e-mail en indice de connexion', async () => {
    setup()
    const res = await call()
    expect(res.status).toBe(307)
    const url = new URL(res.headers.get('location')!)
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth')
    expect(url.searchParams.get('client_id')).toBe('123-abc.apps.googleusercontent.com')
    expect(url.searchParams.get('redirect_uri')).toBe('http://localhost:3000/api/google/callback')
    expect(url.searchParams.get('login_hint')).toBe('olivier@x.fr')
    expect(url.searchParams.get('code_challenge')).toBeTruthy()
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')

    const state = res.cookies.get(STATE_COOKIE)
    const verifier = res.cookies.get(VERIFIER_COOKIE)
    for (const cookie of [state, verifier]) {
      expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'lax', path: COOKIE_PATH, maxAge: 600 })
    }
    expect(state?.value).toBe(url.searchParams.get('state'))
    // Le vérificateur reste côté navigateur : seul son empreinte part chez Google.
    expect(verifier?.value).not.toBe(url.searchParams.get('code_challenge'))
  })
})
