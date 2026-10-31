// Jetons signés du verrouillage. Compatible runtime Edge (middleware) : Web Crypto uniquement.

export const UNLOCK_COOKIE = 'synapse_unlock'
export const CHALLENGE_COOKIE = 'synapse_lock_challenge'

/** Durée maximale d'un déverrouillage « jusqu'à la fermeture » (idle_minutes = 0). */
const SESSION_MAX_SECONDS = 12 * 3600

const encoder = new TextEncoder()

function secret(): string {
  const value = process.env.SYNAPSE_LOCK_SECRET
  if (!value || value.length < 32) throw new Error('SYNAPSE_LOCK_SECRET manquant ou trop court (32 caractères au moins).')
  return value
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  bytes.forEach((b) => (binary += String.fromCharCode(b)))
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function sign(label: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret()), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ])
  const mac = await crypto.subtle.sign('HMAC', key, encoder.encode(`${label}:${payload}`))
  return toBase64Url(new Uint8Array(mac))
}

/** Comparaison à durée constante de deux chaînes. */
function same(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

async function seal(label: string, payload: string): Promise<string> {
  return `${payload}.${await sign(label, payload)}`
}

async function open(label: string, token: string | undefined): Promise<string | null> {
  if (!token) return null
  const cut = token.lastIndexOf('.')
  if (cut < 1) return null
  const payload = token.slice(0, cut)
  return same(token.slice(cut + 1), await sign(label, payload)) ? payload : null
}

/** Signature du contexte que le middleware transmet à la page (identifiant + verrouillage). */
export async function signContext(payload: string): Promise<string> {
  return sign('ctx', payload)
}

export async function verifyContext(payload: string, signature: string): Promise<boolean> {
  return same(signature, await signContext(payload))
}

export type CookieSpec = { name: string; value: string; options: Record<string, unknown> }

function baseOptions(maxAge?: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    ...(maxAge ? { maxAge } : {}),
  }
}

/**
 * Cookie « déverrouillé ». `idleMinutes` = 0 : cookie de session (borné à 12 h côté serveur).
 * Réémis à chaque requête par le middleware, ce qui donne l'expiration glissante.
 */
export async function issueUnlockCookie(userId: string, epoch: number, idleMinutes: number): Promise<CookieSpec> {
  const seconds = idleMinutes > 0 ? idleMinutes * 60 : SESSION_MAX_SECONDS
  const expires = Math.floor(Date.now() / 1000) + seconds
  return {
    name: UNLOCK_COOKIE,
    value: await seal('unlock', `${userId}.${epoch}.${expires}`),
    options: baseOptions(idleMinutes > 0 ? seconds : undefined),
  }
}

export function clearUnlockCookie(): CookieSpec {
  return { name: UNLOCK_COOKIE, value: '', options: { ...baseOptions(), maxAge: 0 } }
}

export async function isUnlocked(token: string | undefined, userId: string, epoch: number): Promise<boolean> {
  const payload = await open('unlock', token)
  if (!payload) return false
  const [uid, tokenEpoch, expires] = payload.split('.')
  return uid === userId && Number(tokenEpoch) === epoch && Number(expires) > Date.now() / 1000
}

export type ChallengePurpose = 'register' | 'authenticate'

/** Défi WebAuthn à usage unique, valable 5 minutes, lié à l'utilisateur et à l'usage. */
export async function issueChallengeCookie(
  purpose: ChallengePurpose,
  userId: string,
  challenge: string,
): Promise<CookieSpec> {
  const expires = Math.floor(Date.now() / 1000) + 300
  return {
    name: CHALLENGE_COOKIE,
    value: await seal('challenge', `${purpose}.${userId}.${expires}.${challenge}`),
    options: baseOptions(300),
  }
}

export function clearChallengeCookie(): CookieSpec {
  return { name: CHALLENGE_COOKIE, value: '', options: { ...baseOptions(), maxAge: 0 } }
}

export async function readChallenge(
  token: string | undefined,
  purpose: ChallengePurpose,
  userId: string,
): Promise<string | null> {
  const payload = await open('challenge', token)
  if (!payload) return null
  const [p, uid, expires, ...rest] = payload.split('.')
  if (p !== purpose || uid !== userId || Number(expires) <= Date.now() / 1000) return null
  return rest.join('.')
}
