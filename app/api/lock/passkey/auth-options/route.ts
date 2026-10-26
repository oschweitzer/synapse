import { NextResponse } from 'next/server'
import { generateAuthenticationOptions } from '@simplewebauthn/server'
import { createClient } from '@/lib/supabase/server'
import { relyingParty } from '@/lib/lock/webauthn'
import { issueChallengeCookie } from '@/lib/lock/token'

export async function POST() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (!data.user) return NextResponse.json({ error: 'Session expirée, reconnecte-toi.' }, { status: 401 })

  try {
    const { rpID } = await relyingParty()
    const { data: passkeys, error } = await supabase.schema('synapse').from('lock_passkeys').select('credential_id, transports')
    if (error) throw error
    if (!passkeys?.length) return NextResponse.json({ error: 'Aucune empreinte enregistrée.' }, { status: 404 })

    const options = await generateAuthenticationOptions({
      rpID,
      userVerification: 'required',
      allowCredentials: passkeys.map((p) => ({ id: p.credential_id as string, transports: p.transports as string[] })),
    })

    const response = NextResponse.json(options)
    const { name, value, options: cookieOptions } = await issueChallengeCookie('authenticate', data.user.id, options.challenge)
    response.cookies.set(name, value, cookieOptions)
    return response
  } catch (e) {
    console.error('[lock] options d’authentification', e)
    return NextResponse.json({ error: 'Déverrouillage impossible, réessaie.' }, { status: 500 })
  }
}
