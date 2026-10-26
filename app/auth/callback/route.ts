import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isAllowedUser } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'
  // Redirection relative uniquement, pour éviter une redirection ouverte.
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      const { data } = await supabase.auth.getUser()
      if (data.user && isAllowedUser(data.user)) return NextResponse.redirect(`${origin}${safeNext}`)
      await supabase.auth.signOut()
      return NextResponse.redirect(`${origin}/login?error=denied`)
    }
    console.error('[auth/callback]', error.message)
  }

  return NextResponse.redirect(`${origin}/login?error=1`)
}
