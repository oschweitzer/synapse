import { timingSafeEqual } from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { encryptToken } from '@/lib/google/crypto'
import {
  COOKIE_PATH,
  emailFromIdToken,
  exchangeCode,
  redirectUri,
  SCOPE_CALENDAR,
  SCOPE_GMAIL,
  STATE_COOKIE,
  VERIFIER_COOKIE,
} from '@/lib/google/oauth'

function sameToken(a: string | undefined, b: string | null) {
  if (!a || !b || a.length !== b.length) return false
  return timingSafeEqual(Buffer.from(a), Buffer.from(b))
}

/**
 * Retour du consentement Google : échange du code (avec le secret client, côté
 * serveur uniquement), chiffrement du refresh token, enregistrement via
 * `synapse.save_google_connection`. Le jeton ne repasse jamais par le navigateur.
 */
export async function GET(request: NextRequest) {
  const { origin, searchParams } = request.nextUrl
  const done = (status: string) => {
    const response = NextResponse.redirect(`${origin}/settings?google=${status}`)
    response.cookies.delete({ name: STATE_COOKIE, path: COOKIE_PATH })
    response.cookies.delete({ name: VERIFIER_COOKIE, path: COOKIE_PATH })
    return response
  }

  if (searchParams.get('error')) return done('denied')

  const code = searchParams.get('code')
  const verifier = request.cookies.get(VERIFIER_COOKIE)?.value
  if (!code || !verifier || !sameToken(request.cookies.get(STATE_COOKIE)?.value, searchParams.get('state'))) {
    return done('state')
  }

  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (!data.user) return NextResponse.redirect(`${origin}/login`)

  try {
    const tokens = await exchangeCode(code, redirectUri(origin), verifier)

    // Sans refresh token, la connexion mourrait dans l'heure : on ne l'enregistre pas.
    if (!tokens.refresh_token) return done('no-refresh')

    const scopes = tokens.scope?.split(' ') ?? []
    if (!scopes.includes(SCOPE_CALENDAR) || !scopes.includes(SCOPE_GMAIL)) return done('scopes')

    const { error } = await supabase.schema('synapse').rpc('save_google_connection', {
      p_refresh_token_encrypted: await encryptToken(tokens.refresh_token),
      p_google_email: emailFromIdToken(tokens.id_token),
      p_scopes: scopes,
    })
    if (error) throw error
  } catch (e) {
    console.error('[google/callback]', e)
    return done('error')
  }

  // Première synchro tout de suite, sans attendre le prochain passage de pg_cron.
  const { error: syncError } = await supabase.functions.invoke('synapse-google-sync', { method: 'POST' })
  if (syncError) console.error('[google/callback] première synchro', syncError)

  return done('connected')
}
