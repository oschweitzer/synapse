import { NextResponse, type NextRequest } from 'next/server'
import { clearUnlockCookie } from '@/lib/lock/token'

/** Verrouille tout de suite : efface le cookie de déverrouillage. */
export async function POST(request: NextRequest) {
  const response = NextResponse.redirect(`${request.nextUrl.origin}/unlock`, { status: 303 })
  const { name, value, options } = clearUnlockCookie()
  response.cookies.set(name, value, options)
  return response
}
