/**
 * OAuth Google de Synapse : un consentement propre, distinct de la connexion à
 * Cairn, en lecture seule sur l'agenda et Gmail, plus `drive.file` pour le Sheet
 * des dépenses cash (seuls les fichiers choisis dans le Google Picker, scope non
 * sensible).
 *
 * `gmail.readonly` est un scope restreint : l'application reste en « Production
 * sans vérification » (écran d'avertissement, 100 comptes au plus), ce qui évite
 * l'expiration des refresh tokens après 7 jours du mode Test.
 */

export const SCOPE_CALENDAR = 'https://www.googleapis.com/auth/calendar.readonly'
export const SCOPE_GMAIL = 'https://www.googleapis.com/auth/gmail.readonly'
export const SCOPE_DRIVE_FILE = 'https://www.googleapis.com/auth/drive.file'
export const SCOPES = ['openid', 'email', SCOPE_CALENDAR, SCOPE_GMAIL, SCOPE_DRIVE_FILE]

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

/** Erreur définitive : Google refuse le refresh token, il faut reconnecter Google. */
export class GoogleReauthError extends Error {}

/**
 * Jeton d'accès frais (une heure) depuis le refresh token, pour les appels faits
 * par le serveur Next (Sheets). Même logique que l'Edge Function
 * (`supabase/functions/_shared/google.ts`).
 */
export async function refreshAccessToken(refreshToken: string): Promise<string> {
  const { id, secret } = credentials()
  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: id,
      client_secret: secret,
      grant_type: 'refresh_token',
    }),
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000),
  })
  const body = await res.json()
  if (body.error === 'invalid_grant') throw new GoogleReauthError('Google a refusé le refresh token')
  if (!res.ok) throw new Error(`Google, jeton : ${body.error_description ?? body.error ?? res.status}`)
  return body.access_token as string
}

/**
 * Numéro du projet Google Cloud, en tête de l'id client (`<numéro>-….apps.googleusercontent.com`).
 * Le Picker en a besoin (`setAppId`) pour accorder le fichier choisi à l'application.
 */
export function projectNumber(clientId: string) {
  return clientId.match(/^(\d+)-/)?.[1] ?? null
}

/** Ce que le navigateur peut connaître pour ouvrir le Picker : rien de secret. */
export function pickerConfig() {
  const clientId = process.env.SYNAPSE_GOOGLE_CLIENT_ID
  const apiKey = process.env.SYNAPSE_GOOGLE_PICKER_API_KEY
  const appId = clientId && projectNumber(clientId)
  return clientId && apiKey && appId ? { clientId, apiKey, appId } : null
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
