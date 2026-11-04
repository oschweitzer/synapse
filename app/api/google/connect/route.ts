import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  authorizationUrl,
  codeChallenge,
  COOKIE_PATH,
  randomToken,
  redirectUri,
  STATE_COOKIE,
  VERIFIER_COOKIE,
} from '@/lib/google/oauth'

/** Démarre le consentement Google (agenda en lecture seule + Gmail : en-têtes, marquer comme lu). */
export async function GET(request: NextRequest) {
  const { origin } = request.nextUrl
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (!data.user) return NextResponse.redirect(`${origin}/login`)

  const state = randomToken()
  const verifier = randomToken()

  let url: string
  try {
    url = authorizationUrl({
      redirectUri: redirectUri(origin),
      state,
      challenge: await codeChallenge(verifier),
      loginHint: data.user.email,
    })
  } catch (e) {
    console.error('[google/connect]', e)
    return NextResponse.redirect(`${origin}/settings?google=config`)
  }

  const response = NextResponse.redirect(url)
  const cookie = {
    httpOnly: true,
    secure: request.nextUrl.protocol === 'https:',
    sameSite: 'lax' as const,
    path: COOKIE_PATH,
    maxAge: 10 * 60,
  }
  response.cookies.set(STATE_COOKIE, state, cookie)
  response.cookies.set(VERIFIER_COOKIE, verifier, cookie)
  return response
}
