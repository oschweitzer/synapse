import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  GoogleReauthError,
  SCOPES,
  authorizationUrl,
  codeChallenge,
  emailFromIdToken,
  exchangeCode,
  pickerConfig,
  projectNumber,
  randomToken,
  redirectUri,
  refreshAccessToken,
} from '@/lib/google/oauth'

const CLIENT_ID = '123456-abc.apps.googleusercontent.com'
const fetchMock = vi.fn()

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  vi.stubEnv('SYNAPSE_GOOGLE_CLIENT_ID', CLIENT_ID)
  vi.stubEnv('SYNAPSE_GOOGLE_CLIENT_SECRET', 'secret')
  vi.stubEnv('SYNAPSE_GOOGLE_PICKER_API_KEY', 'api-key')
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', '')
})

describe('redirectUri', () => {
  it('utilise NEXT_PUBLIC_SITE_URL sans les barres finales', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://synapse.example.com//')
    expect(redirectUri('http://localhost:3000')).toBe('https://synapse.example.com/api/google/callback')
  })

  it('retombe sur l’origine de la requête', () => {
    expect(redirectUri('http://localhost:3000')).toBe('http://localhost:3000/api/google/callback')
  })
})

describe('randomToken / codeChallenge', () => {
  it('randomToken fait 43 caractères base64url et change à chaque appel', () => {
    const a = randomToken()
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(randomToken()).not.toBe(a)
  })

  it('codeChallenge suit l’exemple de la RFC 7636', async () => {
    expect(await codeChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    )
  })
})

describe('authorizationUrl', () => {
  const params = { redirectUri: 'https://app/cb', state: 'st', challenge: 'ch' }

  it('contient tous les paramètres du flux OAuth avec PKCE', () => {
    const url = new URL(authorizationUrl(params))
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth')
    const q = url.searchParams
    expect(q.get('client_id')).toBe(CLIENT_ID)
    expect(q.get('redirect_uri')).toBe('https://app/cb')
    expect(q.get('response_type')).toBe('code')
    expect(q.get('scope')).toBe(SCOPES.join(' '))
    expect(q.get('access_type')).toBe('offline')
    expect(q.get('prompt')).toBe('consent')
    expect(q.get('state')).toBe('st')
    expect(q.get('code_challenge')).toBe('ch')
    expect(q.get('code_challenge_method')).toBe('S256')
    expect(q.has('login_hint')).toBe(false)
  })

  it('ajoute login_hint seulement s’il est donné', () => {
    const url = new URL(authorizationUrl({ ...params, loginHint: 'a@x.fr' }))
    expect(url.searchParams.get('login_hint')).toBe('a@x.fr')
  })

  it('lève sans identifiant ou sans secret client', () => {
    vi.stubEnv('SYNAPSE_GOOGLE_CLIENT_ID', '')
    expect(() => authorizationUrl(params)).toThrow('SYNAPSE_GOOGLE_CLIENT_ID')
    vi.stubEnv('SYNAPSE_GOOGLE_CLIENT_ID', CLIENT_ID)
    vi.stubEnv('SYNAPSE_GOOGLE_CLIENT_SECRET', '')
    expect(() => authorizationUrl(params)).toThrow('SYNAPSE_GOOGLE_CLIENT_SECRET')
  })
})

describe('exchangeCode', () => {
  it('POSTe le code et le verifier en formulaire, et renvoie les jetons', async () => {
    const tokens = { access_token: 'at', refresh_token: 'rt', expires_in: 3600 }
    fetchMock.mockResolvedValue(json(tokens))
    expect(await exchangeCode('the-code', 'https://app/cb', 'the-verifier')).toEqual(tokens)

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://oauth2.googleapis.com/token')
    expect(init.method).toBe('POST')
    expect(init.headers['content-type']).toBe('application/x-www-form-urlencoded')
    const body = init.body as URLSearchParams
    expect(Object.fromEntries(body)).toEqual({
      code: 'the-code',
      client_id: CLIENT_ID,
      client_secret: 'secret',
      redirect_uri: 'https://app/cb',
      code_verifier: 'the-verifier',
      grant_type: 'authorization_code',
    })
  })

  it('lève avec error_description quand Google refuse', async () => {
    fetchMock.mockResolvedValue(json({ error: 'invalid_request', error_description: 'Bad code' }, 400))
    await expect(exchangeCode('c', 'r', 'v')).rejects.toThrow('Bad code')
  })

  it('retombe sur error sans description', async () => {
    fetchMock.mockResolvedValue(json({ error: 'invalid_request' }, 400))
    await expect(exchangeCode('c', 'r', 'v')).rejects.toThrow('invalid_request')
  })
})

describe('refreshAccessToken', () => {
  it('renvoie le jeton d’accès', async () => {
    fetchMock.mockResolvedValue(json({ access_token: 'fresh' }))
    expect(await refreshAccessToken('rt')).toBe('fresh')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://oauth2.googleapis.com/token')
    expect(Object.fromEntries(init.body as URLSearchParams)).toMatchObject({
      refresh_token: 'rt',
      grant_type: 'refresh_token',
      client_id: CLIENT_ID,
    })
  })

  it('lève GoogleReauthError sur invalid_grant', async () => {
    fetchMock.mockResolvedValue(json({ error: 'invalid_grant' }, 400))
    await expect(refreshAccessToken('rt')).rejects.toBeInstanceOf(GoogleReauthError)
  })

  it('lève une Error simple (pas GoogleReauthError) sur les autres erreurs', async () => {
    fetchMock.mockResolvedValue(json({ error: 'server_error', error_description: 'Oups' }, 500))
    const error = await refreshAccessToken('rt').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(Error)
    expect(error).not.toBeInstanceOf(GoogleReauthError)
    expect((error as Error).message).toContain('Oups')
  })

  it('mentionne le statut quand le corps n’explique rien', async () => {
    fetchMock.mockResolvedValue(json({}, 503))
    await expect(refreshAccessToken('rt')).rejects.toThrow('503')
  })
})

describe('projectNumber', () => {
  it('extrait les chiffres de tête de l’id client', () => {
    expect(projectNumber(CLIENT_ID)).toBe('123456')
  })

  it('renvoie null sans chiffres de tête', () => {
    expect(projectNumber('abc-123.apps.googleusercontent.com')).toBeNull()
    expect(projectNumber('123456')).toBeNull()
  })
})

describe('pickerConfig', () => {
  it('renvoie clientId, apiKey et appId quand tout est défini', () => {
    expect(pickerConfig()).toEqual({ clientId: CLIENT_ID, apiKey: 'api-key', appId: '123456' })
  })

  it('renvoie null quand un élément manque', () => {
    vi.stubEnv('SYNAPSE_GOOGLE_PICKER_API_KEY', '')
    expect(pickerConfig()).toBeNull()
    vi.stubEnv('SYNAPSE_GOOGLE_PICKER_API_KEY', 'api-key')
    vi.stubEnv('SYNAPSE_GOOGLE_CLIENT_ID', '')
    expect(pickerConfig()).toBeNull()
    vi.stubEnv('SYNAPSE_GOOGLE_CLIENT_ID', 'sans-numero.apps.googleusercontent.com')
    expect(pickerConfig()).toBeNull()
  })
})

describe('emailFromIdToken', () => {
  const token = (payload: string) => `entete.${Buffer.from(payload).toString('base64url')}.signature`

  it('lit l’adresse dans la charge utile', () => {
    expect(emailFromIdToken(token(JSON.stringify({ email: 'a@x.fr' })))).toBe('a@x.fr')
  })

  it('renvoie null sans jeton, sans charge utile, en JSON invalide ou sans adresse', () => {
    expect(emailFromIdToken(undefined)).toBeNull()
    expect(emailFromIdToken('seul')).toBeNull()
    expect(emailFromIdToken(token('pas du json'))).toBeNull()
    expect(emailFromIdToken(token(JSON.stringify({ sub: '1' })))).toBeNull()
  })
})

describe('GOOGLE_OAUTH_TOKEN_URL (tests e2e uniquement)', () => {
  const MOCK = 'http://127.0.0.1:4010/google/token'

  it('exchangeCode POSTe vers GOOGLE_OAUTH_TOKEN_URL quand elle est définie', async () => {
    vi.stubEnv('GOOGLE_OAUTH_TOKEN_URL', MOCK)
    fetchMock.mockResolvedValue(json({ access_token: 'at', expires_in: 3600 }))
    await exchangeCode('c', 'https://app/cb', 'v')
    expect(fetchMock.mock.calls[0][0]).toBe(MOCK)
  })

  it('refreshAccessToken POSTe vers GOOGLE_OAUTH_TOKEN_URL quand elle est définie', async () => {
    vi.stubEnv('GOOGLE_OAUTH_TOKEN_URL', MOCK)
    fetchMock.mockResolvedValue(json({ access_token: 'fresh' }))
    await refreshAccessToken('rt')
    expect(fetchMock.mock.calls[0][0]).toBe(MOCK)
  })

  it('une GOOGLE_OAUTH_TOKEN_URL vide retombe sur Google', async () => {
    vi.stubEnv('GOOGLE_OAUTH_TOKEN_URL', '')
    fetchMock.mockResolvedValue(json({ access_token: 'fresh' }))
    await refreshAccessToken('rt')
    expect(fetchMock.mock.calls[0][0]).toBe('https://oauth2.googleapis.com/token')
  })
})
