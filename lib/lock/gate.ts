import type { SupabaseClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { UNLOCK_COOKIE, isUnlocked, issueUnlockCookie } from '@/lib/lock/token'
import { readLockConfig } from '@/lib/lock/config'

/** Chemins accessibles verrouillé : la page de déverrouillage et ses routes, la déconnexion. */
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
  return LOCK_EXEMPT_ROUTES.includes(pathname)
}

/**
 * Second facteur : renvoie `null` si l'accès est permis (cookie de déverrouillage réémis dans
 * `response` pour prolonger l'inactivité), sinon la redirection / le 401 à renvoyer.
 * Sans verrouillage activé, tout passe. Toute erreur (lecture, secret manquant) reste verrouillée.
 */
export async function enforceLock(
  request: NextRequest,
  supabase: SupabaseClient,
  userId: string,
  response: NextResponse,
  redirect: (url: URL) => NextResponse,
): Promise<NextResponse | null> {
  let unlocked = false
  try {
    const config = await readLockConfig(supabase)
    if (!config) return null
    unlocked = await isUnlocked(request.cookies.get(UNLOCK_COOKIE)?.value, userId, config.epoch)
    if (unlocked) {
      const { name, value, options } = await issueUnlockCookie(userId, config.epoch, config.idleMinutes)
      response.cookies.set(name, value, options)
    }
  } catch (e) {
    console.error('[lock] vérification', e)
  }
  if (unlocked || isExempt(request)) return null

  const { pathname } = request.nextUrl
  if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'locked' }, { status: 401 })
  const url = request.nextUrl.clone()
  url.pathname = '/unlock'
  url.search = request.method === 'GET' && pathname !== '/' ? `?next=${encodeURIComponent(pathname + request.nextUrl.search)}` : ''
  return redirect(url)
}
