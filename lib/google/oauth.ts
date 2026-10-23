/**
 * OAuth Google de Synapse : un consentement propre, distinct de la connexion à
 * Cairn, en lecture seule sur l'agenda et Gmail.
 *
 * `gmail.readonly` est un scope restreint : l'application reste en « Production
 * sans vérification » (écran d'avertissement, 100 comptes au plus), ce qui évite
 * l'expiration des refresh tokens après 7 jours du mode Test.
 */

export const SCOPE_CALENDAR = 'https://www.googleapis.com/auth/calendar.readonly'
export const SCOPE_GMAIL = 'https://www.googleapis.com/auth/gmail.readonly'
export const SCOPES = ['openid', 'email', SCOPE_CALENDAR, SCOPE_GMAIL]

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'

/** Cookies du flux en cours (state + PKCE), limités aux routes /api/google. */
export const STATE_COOKIE = 'synapse_google_state'
export const VERIFIER_COOKIE = 'synapse_google_verifier'
export const COOKIE_PATH = '/api/google'

function credentials() {
  const id = process.env.SYNAPSE_GOOGLE_CLIENT_ID
  const secret = process.env.SYNAPSE_GOOGLE_CLIENT_SECRET
  if (!id || !secret) throw new Error('SYNAPSE_GOOGLE_CLIENT_ID ou SYNAPSE_GOOGLE_CLIENT_SECRET manquant')
  return { id, secret }
}

/** Adresse de retour déclarée dans le client OAuth : `<NEXT_PUBLIC_SITE_URL>/api/google/callback`. */
export function redirectUri(origin: string) {
  const base = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, '') || origin
  return `${base}/api/google/callback`
}

function base64url(bytes: Uint8Array) {
  return Buffer.from(bytes).toString('base64url')
}

export function randomToken() {
  return base64url(crypto.getRandomValues(new Uint8Array(32)))
}

export async function codeChallenge(verifier: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return base64url(new Uint8Array(digest))
}

export function authorizationUrl(params: { redirectUri: string; state: string; challenge: string; loginHint?: string }) {
  const query = new URLSearchParams({
    client_id: credentials().id,
    redirect_uri: params.redirectUri,
    response_type: 'code',
    scope: SCOPES.join(' '),
    // Refresh token durable, redemandé à chaque consentement : sans `prompt=consent`,
    // Google ne le renvoie qu'à la toute première autorisation.
    access_type: 'offline',
    prompt: 'consent',
    state: params.state,
    code_challenge: params.challenge,
    code_challenge_method: 'S256',
  })
  if (params.loginHint) query.set('login_hint', params.loginHint)
  return `${AUTH_ENDPOINT}?${query}`
}

export type GoogleTokens = {
  access_token: string
  refresh_token?: string
  expires_in: number
  scope?: string
  id_token?: string
}

export async function exchangeCode(code: string, redirectUri: string, verifier: string): Promise<GoogleTokens> {
  const { id, secret } = credentials()
  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: id,
      client_secret: secret,
      redirect_uri: redirectUri,
      code_verifier: verifier,
      grant_type: 'authorization_code',
    }),
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(`Google a refusé l'échange du code : ${body.error_description ?? body.error}`)
  return body as GoogleTokens
}

/**
 * Adresse du compte Google, lue dans l'`id_token` sans vérifier sa signature :
 * il arrive directement de Google en HTTPS, en réponse à notre requête
 * authentifiée par le secret client. Elle ne sert qu'à l'affichage.
 */
export function emailFromIdToken(idToken: string | undefined) {
  const payload = idToken?.split('.')[1]
  if (!payload) return null
  try {
    return (JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { email?: string }).email ?? null
  } catch {
    return null
  }
}
