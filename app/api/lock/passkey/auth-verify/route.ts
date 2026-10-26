import { NextResponse, type NextRequest } from 'next/server'
import { verifyAuthenticationResponse } from '@simplewebauthn/server'
import type { AuthenticationResponseJSON } from '@simplewebauthn/server'
import { createClient } from '@/lib/supabase/server'
import { fromBase64Url, relyingParty } from '@/lib/lock/webauthn'
import { CHALLENGE_COOKIE, clearChallengeCookie, issueUnlockCookie, readChallenge } from '@/lib/lock/token'
import { readLockConfig } from '@/lib/lock/config'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (!data.user) return NextResponse.json({ error: 'Session expirée, reconnecte-toi.' }, { status: 401 })

  const body = (await request.json().catch(() => null)) as { response?: AuthenticationResponseJSON } | null
  if (!body?.response?.id) return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 })

  try {
    const challenge = await readChallenge(request.cookies.get(CHALLENGE_COOKIE)?.value, 'authenticate', data.user.id)
    if (!challenge) return NextResponse.json({ error: 'Demande expirée, recommence.' }, { status: 400 })

    const config = await readLockConfig(supabase)
    if (!config) return NextResponse.json({ error: 'Le verrouillage n’est pas activé.' }, { status: 400 })

    const db = supabase.schema('synapse')
    const { data: passkey, error } = await db
      .from('lock_passkeys')
      .select('id, public_key, counter, transports')
      .eq('credential_id', body.response.id)
      .maybeSingle()
    if (error) throw error
    if (!passkey) return NextResponse.json({ error: 'Empreinte inconnue.' }, { status: 400 })

    const { rpID, origin } = await relyingParty()
    const verification = await verifyAuthenticationResponse({
      response: body.response,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
      credential: {
        id: body.response.id,
        publicKey: fromBase64Url(passkey.public_key as string),
        counter: Number(passkey.counter),
        transports: passkey.transports as string[],
      },
    })
    if (!verification.verified) return NextResponse.json({ error: 'Empreinte non reconnue.' }, { status: 401 })

    const { error: updateError } = await db
      .from('lock_passkeys')
      .update({ counter: verification.authenticationInfo.newCounter, last_used_at: new Date().toISOString() })
      .eq('id', passkey.id as string)
    if (updateError) console.error('[lock] compteur de la passkey', updateError)

    const response = NextResponse.json({ ok: true })
    const unlock = await issueUnlockCookie(data.user.id, config.epoch, config.idleMinutes)
    response.cookies.set(unlock.name, unlock.value, unlock.options)
    const cleared = clearChallengeCookie()
    response.cookies.set(cleared.name, cleared.value, cleared.options)
    return response
  } catch (e) {
    console.error('[lock] vérification de la passkey', e)
    return NextResponse.json({ error: 'Empreinte non reconnue.' }, { status: 401 })
  }
}
