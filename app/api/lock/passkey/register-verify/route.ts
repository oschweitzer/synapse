import { NextResponse, type NextRequest } from 'next/server'
import { verifyRegistrationResponse } from '@simplewebauthn/server'
import type { RegistrationResponseJSON } from '@simplewebauthn/server'
import { createClient } from '@/lib/supabase/server'
import { relyingParty, toBase64Url } from '@/lib/lock/webauthn'
import { CHALLENGE_COOKIE, clearChallengeCookie, readChallenge } from '@/lib/lock/token'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (!data.user) return NextResponse.json({ error: 'Session expirée, reconnecte-toi.' }, { status: 401 })

  const body = (await request.json().catch(() => null)) as { response?: RegistrationResponseJSON; label?: unknown } | null
  if (!body?.response) return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 })
  const label = typeof body.label === 'string' ? body.label.trim().slice(0, 60) : ''

  try {
    const challenge = await readChallenge(request.cookies.get(CHALLENGE_COOKIE)?.value, 'register', data.user.id)
    if (!challenge) return NextResponse.json({ error: 'Demande expirée, recommence.' }, { status: 400 })

    const { rpID, origin } = await relyingParty()
    const verification = await verifyRegistrationResponse({
      response: body.response,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
    })
    if (!verification.verified) return NextResponse.json({ error: 'Empreinte non reconnue.' }, { status: 400 })

    const { credential } = verification.registrationInfo
    const { error } = await supabase
      .schema('synapse')
      .from('lock_passkeys')
      .insert({
        credential_id: credential.id,
        public_key: toBase64Url(credential.publicKey),
        counter: credential.counter,
        transports: credential.transports ?? [],
        label: label || 'Cet appareil',
      })
    if (error) throw error

    const response = NextResponse.json({ ok: true })
    const { name, value, options } = clearChallengeCookie()
    response.cookies.set(name, value, options)
    return response
  } catch (e) {
    console.error('[lock] enregistrement de la passkey', e)
    return NextResponse.json({ error: 'Enregistrement impossible, réessaie.' }, { status: 400 })
  }
}
