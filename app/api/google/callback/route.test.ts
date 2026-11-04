import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createClient } from '@/lib/supabase/server'
import { encryptToken } from '@/lib/google/crypto'
import { COOKIE_PATH, SCOPE_CALENDAR, SCOPE_GMAIL, STATE_COOKIE, VERIFIER_COOKIE, exchangeCode } from '@/lib/google/oauth'
import { mockServerClient, testUser } from '@/test/supabase-mock'
import { jsonRequest } from '@/test/next-mock'
import { GET } from './route'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/google/crypto', () => ({ encryptToken: vi.fn() }))
vi.mock('@/lib/google/oauth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/google/oauth')>()),
  exchangeCode: vi.fn(),
}))

const boom = { message: 'boom' }
const SCOPES = `openid email ${SCOPE_CALENDAR} ${SCOPE_GMAIL}`
const idToken = (payload: object) => `h.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.s`
const TOKENS = { access_token: 'at', expires_in: 3600, refresh_token: 'rt', scope: SCOPES, id_token: idToken({ email: 'moi@example.com' }) }

function setup(opts: Parameters<typeof mockServerClient>[0] = {}) {
  return mockServerClient({ user: testUser(), rpc: { save_google_connection: { data: null } }, functions: { 'synapse-google-sync': { data: {} } }, ...opts })
}

const call = (query = '?code=c1&state=s1', cookie = `${STATE_COOKIE}=s1; ${VERIFIER_COOKIE}=v1`) =>
  GET(jsonRequest(`/api/google/callback${query}`, { method: 'GET', contentType: null, cookie }))

const location = (res: Response) => res.headers.get('location')
const to = (status: string) => `http://localhost:3000/settings?google=${status}`

/** Cookie supprimé : valeur vide et date d'expiration passée. */
function expectCleared(res: Awaited<ReturnType<typeof call>>) {
  for (const name of [STATE_COOKIE, VERIFIER_COOKIE]) {
    expect(res.cookies.get(name)).toMatchObject({ value: '', path: COOKIE_PATH })
    expect(res.cookies.get(name)?.expires).toEqual(new Date(0))
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(encryptToken).mockResolvedValue('cipher')
  vi.mocked(exchangeCode).mockResolvedValue(TOKENS)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('GET /api/google/callback', () => {
  it('consentement refusé : ?google=denied et cookies du flux supprimés', async () => {
    const res = await call('?error=access_denied')
    expect(location(res)).toBe(to('denied'))
    expectCleared(res)
    expect(createClient).not.toHaveBeenCalled()
  })

  it.each([
    ['code manquant', '?state=s1', `${STATE_COOKIE}=s1; ${VERIFIER_COOKIE}=v1`],
    ['cookie du vérificateur manquant', '?code=c1&state=s1', `${STATE_COOKIE}=s1`],
    ['cookie du state manquant', '?code=c1&state=s1', `${VERIFIER_COOKIE}=v1`],
    ['state absent de l’adresse', '?code=c1', `${STATE_COOKIE}=s1; ${VERIFIER_COOKIE}=v1`],
    ['state falsifié (même longueur)', '?code=c1&state=s2', `${STATE_COOKIE}=s1; ${VERIFIER_COOKIE}=v1`],
    ['state falsifié (autre longueur)', '?code=c1&state=s1x', `${STATE_COOKIE}=s1; ${VERIFIER_COOKIE}=v1`],
  ])('%s : ?google=state, sans session ni échange', async (_label, query, cookie) => {
    const res = await call(query, cookie)
    expect(location(res)).toBe(to('state'))
    expectCleared(res)
    expect(createClient).not.toHaveBeenCalled()
    expect(exchangeCode).not.toHaveBeenCalled()
  })

  it('sans session : redirige vers /login sans échanger le code', async () => {
    setup({ user: null })
    const res = await call()
    expect(location(res)).toBe('http://localhost:3000/login')
    expect(exchangeCode).not.toHaveBeenCalled()
  })

  it('échange refusé par Google : ?google=error', async () => {
    setup()
    vi.mocked(exchangeCode).mockRejectedValue(new Error('invalid_grant'))
    const res = await call()
    expect(location(res)).toBe(to('error'))
    expectCleared(res)
  })

  it('transmet le code, l’adresse de retour et le vérificateur à Google', async () => {
    setup()
    await call()
    expect(exchangeCode).toHaveBeenCalledWith('c1', 'http://localhost:3000/api/google/callback', 'v1')
  })

  it('sans refresh token : ?google=no-refresh, rien d’enregistré', async () => {
    const { rpc } = setup()
    vi.mocked(exchangeCode).mockResolvedValue({ ...TOKENS, refresh_token: undefined })
    expect(location(await call())).toBe(to('no-refresh'))
    expect(rpc).not.toHaveBeenCalled()
  })

  it.each([
    ['sans accès Gmail', `openid email ${SCOPE_CALENDAR}`],
    ['sans accès agenda', `openid email ${SCOPE_GMAIL}`],
    ['avec l’ancien scope gmail.readonly', `openid email ${SCOPE_CALENDAR} https://www.googleapis.com/auth/gmail.readonly`],
    ['sans aucun scope', undefined],
  ])('%s : ?google=scopes, rien d’enregistré', async (_label, scope) => {
    const { rpc } = setup()
    vi.mocked(exchangeCode).mockResolvedValue({ ...TOKENS, scope })
    expect(location(await call())).toBe(to('scopes'))
    expect(rpc).not.toHaveBeenCalled()
  })

  it('erreur à l’enregistrement : ?google=error, sans synchro', async () => {
    const { invoke } = setup({ rpc: { save_google_connection: { error: boom } } })
    expect(location(await call())).toBe(to('error'))
    expect(invoke).not.toHaveBeenCalled()
  })

  it('connecte : enregistre le jeton chiffré, lance la première synchro', async () => {
    const { rpc, invoke } = setup()
    const res = await call()
    expect(location(res)).toBe(to('connected'))
    expectCleared(res)
    expect(encryptToken).toHaveBeenCalledWith('rt')
    expect(rpc).toHaveBeenCalledWith('save_google_connection', {
      p_refresh_token_encrypted: 'cipher',
      p_google_email: 'moi@example.com',
      p_scopes: SCOPES.split(' '),
    })
    expect(invoke).toHaveBeenCalledWith('synapse-google-sync', { method: 'POST' })
  })

  it('première synchro en erreur : seulement journalisée, la connexion reste réussie', async () => {
    setup({ functions: { 'synapse-google-sync': { error: boom } } })
    expect(location(await call())).toBe(to('connected'))
    expect(console.error).toHaveBeenCalled()
  })
})
