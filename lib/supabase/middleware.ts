import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { isAllowedUser } from '@/lib/auth'
import { checkLock } from '@/lib/lock/gate'
import {
  LOCK_HEADER,
  SIGNATURE_HEADER,
  USER_ID_HEADER,
  encodeLock,
  signRequestContext,
  stripForwardedHeaders,
} from '@/lib/request-context-headers'

const PUBLIC_PATHS = ['/login', '/auth']

/** Redirige en conservant les cookies (et en-têtes) de session posés par Supabase. */
function redirectWithCookies(url: URL, from: NextResponse, status = 307) {
  const redirect = NextResponse.redirect(url, status)
  from.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie))
  from.headers.forEach((value, key) => {
    if (key.toLowerCase() === 'cache-control') redirect.headers.set(key, value)
  })
  return redirect
}

/** Réponse `next` qui transmet les en-têtes de requête courants, avec les cookies et en-têtes de `from`. */
function nextWithContext(request: NextRequest, from: NextResponse) {
  const next = NextResponse.next({ request })
  from.cookies.getAll().forEach((cookie) => next.cookies.set(cookie))
  from.headers.forEach((value, key) => {
    const name = key.toLowerCase()
    if (!name.startsWith('x-middleware-') && name !== 'set-cookie') next.headers.set(key, value)
  })
  return next
}

export async function updateSession(request: NextRequest) {
  // Anti-usurpation : un client ne peut jamais fournir le contexte que le middleware transmet à la page.
  stripForwardedHeaders(request.headers)
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
          // Cache-Control: no-store fourni par Supabase, pour qu'un CDN ne cache pas un Set-Cookie de session.
          Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value))
        },
      },
    },
  )

  const { data } = await supabase.auth.getUser()
  const { pathname } = request.nextUrl
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))

  if (data.user && !isAllowedUser(data.user)) {
    // Compte hors liste blanche : déconnecté aussitôt (les cookies effacés sont dans `response`).
    await supabase.auth.signOut()
    if (pathname === '/login') return response
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.search = '?error=denied'
    return redirectWithCookies(url, response)
  }

  if (!data.user && !isPublic) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.search = ''
    return redirectWithCookies(url, response)
  }

  if (data.user && pathname === '/login') {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    url.search = ''
    return redirectWithCookies(url, response)
  }

  if (data.user && !isPublic) {
    // Second facteur : sans code (ou passkey) saisi, le dashboard et ses actions restent fermés.
    const { blocked, lock } = await checkLock(request, supabase, data.user.id, response, (url) =>
      redirectWithCookies(url, response, request.method === 'GET' ? 307 : 303),
    )
    if (blocked) return blocked
    if (lock) {
      // Utilisateur et verrouillage déjà vérifiés : la page les relit ici au lieu de les redemander à Supabase.
      // Les en-têtes sont signés (HMAC, SYNAPSE_LOCK_SECRET) : une requête qui contournerait le middleware
      // ne peut pas les forger. Sans secret, rien n'est transmis et la page relit tout.
      const encoded = encodeLock(lock)
      try {
        const signature = await signRequestContext(data.user.id, encoded)
        request.headers.set(USER_ID_HEADER, data.user.id)
        request.headers.set(LOCK_HEADER, encoded)
        request.headers.set(SIGNATURE_HEADER, signature)
        return nextWithContext(request, response)
      } catch {
        return response
      }
    }
  }

  return response
}
