import { NextResponse } from 'next/server'
import { generateRegistrationOptions } from '@simplewebauthn/server'
import { createClient } from '@/lib/supabase/server'
import { RP_NAME, relyingParty } from '@/lib/lock/webauthn'
import { issueChallengeCookie } from '@/lib/lock/token'

/** Début de l'enregistrement d'une empreinte : réservé à une session déverrouillée (middleware). */
export async function POST() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (!data.user) return NextResponse.json({ error: 'Session expirée, reconnecte-toi.' }, { status: 401 })

  try {
    const { rpID } = await relyingParty()
    const { data: existing, error } = await supabase.schema('synapse').from('lock_passkeys').select('credential_id, transports')
    if (error) throw error

    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID,
      userName: data.user.email ?? data.user.id,
      userID: new TextEncoder().encode(data.user.id),
      attestationType: 'none',
      excludeCredentials: (existing ?? []).map((p) => ({ id: p.credential_id as string, transports: p.transports as string[] })),
      authenticatorSelection: { authenticatorAttachment: 'platform', residentKey: 'preferred', userVerification: 'required' },
    })

    const response = NextResponse.json(options)
    const { name, value, options: cookieOptions } = await issueChallengeCookie('register', data.user.id, options.challenge)
    response.cookies.set(name, value, cookieOptions)
    return response
  } catch (e) {
    console.error('[lock] options d’enregistrement', e)
    return NextResponse.json({ error: 'Enregistrement impossible, réessaie.' }, { status: 500 })
  }
}
