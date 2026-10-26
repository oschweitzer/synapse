import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { attemptCode, attemptMessage } from '@/lib/lock/server'
import { issueUnlockCookie } from '@/lib/lock/token'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (!data.user) return NextResponse.json({ error: 'Session expirée, reconnecte-toi.' }, { status: 401 })

  const body = (await request.json().catch(() => null)) as { code?: unknown } | null
  if (typeof body?.code !== 'string' || !body.code || body.code.length > 256) {
    return NextResponse.json({ error: 'Saisis ton code.' }, { status: 400 })
  }

  try {
    const result = await attemptCode(supabase, body.code)
    if (!result.ok) {
      return NextResponse.json(
        { error: attemptMessage(result), signedOut: result.reason === 'signed-out' },
        { status: result.reason === 'throttled' ? 429 : 401 },
      )
    }
    const response = NextResponse.json({ ok: true })
    const { name, value, options } = await issueUnlockCookie(data.user.id, result.config.epoch, result.config.idleMinutes)
    response.cookies.set(name, value, options)
    return response
  } catch (e) {
    console.error('[lock] vérification du code', e)
    return NextResponse.json({ error: 'Vérification impossible, réessaie.' }, { status: 500 })
  }
}
