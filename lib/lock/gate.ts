import type { SupabaseClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { UNLOCK_COOKIE, isUnlocked, issueUnlockCookie } from '@/lib/lock/token'
import { readLockConfig, type LockState } from '@/lib/lock/config'

/** Chemins accessibles verrouillé : la page de déverrouillage et ses routes, la page d'accueil (gardée par la page). */
const LOCK_EXEMPT_ROUTES = [
  '/api/lock/verify',
  '/api/lock/lock',
  '/api/lock/passkey/auth-options',
  '/api/lock/passkey/auth-verify',
]

function isExempt(request: NextRequest): boolean {
  const { pathname } = request.nextUrl
  // Une Server Action peut être appelée depuis n'importe quelle URL : jamais exemptée.
  if (request.headers.has('next-action')) return false
  if (pathname === '/unlock') return request.method === 'GET'
  // La page d'accueil se charge verrouillée : un dashboard public s'affiche avec la session seule,
  // et la page elle-même refuse un dashboard privé (lib/lock/page.ts). Actions et API restent fermées.
  if (pathname === '/') return request.method === 'GET'
  return LOCK_EXEMPT_ROUTES.includes(pathname)
}

/**
 * Second facteur : `blocked` vaut `null` si l'accès est permis (cookie de déverrouillage réémis dans
 * `response` pour prolonger l'inactivité), sinon la redirection / le 401 à renvoyer.
 * Sans verrouillage activé, tout passe. Toute erreur (lecture, secret manquant) reste verrouillée.
 * `lock` est l'état lu (`null` si la lecture a échoué) : le middleware le transmet à la page
 * pour qu'elle ne le relise pas.
 */
export async function checkLock(
  request: NextRequest,
  supabase: SupabaseClient,
  userId: string,
  response: NextResponse,
  redirect: (url: URL) => NextResponse,
): Promise<{ blocked: NextResponse | null; lock: LockState | null }> {
  let unlocked = false
  let lock: LockState | null = null
  try {
    const config = await readLockConfig(supabase)
    if (!config) return { blocked: null, lock: { config: null, unlocked: true } }
    unlocked = await isUnlocked(request.cookies.get(UNLOCK_COOKIE)?.value, userId, config.epoch)
    if (unlocked) {
      const { name, value, options } = await issueUnlockCookie(userId, config.epoch, config.idleMinutes)
      response.cookies.set(name, value, options)
    }
    lock = { config, unlocked }
  } catch (e) {
    console.error('[lock] vérification', e)
  }
  if (unlocked || isExempt(request)) return { blocked: null, lock }

  const { pathname } = request.nextUrl
  if (pathname.startsWith('/api/')) return { blocked: NextResponse.json({ error: 'locked' }, { status: 401 }), lock }
  const url = request.nextUrl.clone()
  url.pathname = '/unlock'
  url.search = request.method === 'GET' && pathname !== '/' ? `?next=${encodeURIComponent(pathname + request.nextUrl.search)}` : ''
  return { blocked: redirect(url), lock }
}
