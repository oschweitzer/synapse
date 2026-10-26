import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { isAllowedUser } from '@/lib/auth'

const PUBLIC_PATHS = ['/login', '/auth']

/** Redirige en conservant les cookies (et en-têtes) de session posés par Supabase. */
function redirectWithCookies(url: URL, from: NextResponse) {
  const redirect = NextResponse.redirect(url)
  from.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie))
  from.headers.forEach((value, key) => {
    if (key.toLowerCase() === 'cache-control') redirect.headers.set(key, value)
  })
  return redirect
}

export async function updateSession(request: NextRequest) {
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

  return response
}
