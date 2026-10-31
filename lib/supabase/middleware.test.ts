import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { isAllowedUser } from '@/lib/auth'
import { checkLock } from '@/lib/lock/gate'
import { updateSession } from '@/lib/supabase/middleware'
import { encodeLock, signRequestContext } from '@/lib/request-context-headers'

vi.mock('@supabase/ssr', () => ({ createServerClient: vi.fn() }))
vi.mock('@/lib/auth', () => ({ isAllowedUser: vi.fn() }))
vi.mock('@/lib/lock/gate', () => ({ checkLock: vi.fn() }))

const ID = '123e4567-e89b-12d3-a456-426614174000'
const OTHER = '99999999-e89b-12d3-a456-426614174000'
const LOCK = { config: { idleMinutes: 5, epoch: 2 }, unlocked: true }
const SPOOF = { 'x-synapse-user-id': OTHER, 'x-synapse-lock': '{"config":null,"unlocked":true}' }

type CookieOptions = { setAll: (c: { name: string; value: string; options?: object }[], h: Record<string, string>) => void }
let cookieOptions: CookieOptions
let getUser: ReturnType<typeof vi.fn>

function req(path: string, headers: Record<string, string> = SPOOF) {
  return new NextRequest(`http://localhost:3000${path}`, { headers })
}

/** En-têtes de requête transmis à la page, lus dans les en-têtes internes de Next. */
function forwarded(res: NextResponse): Record<string, string> {
  const names = (res.headers.get('x-middleware-override-headers') ?? '').split(',').filter(Boolean)
  return Object.fromEntries(names.map((n) => [n, res.headers.get(`x-middleware-request-${n}`) ?? '']))
}

beforeEach(() => {
  vi.stubEnv('SYNAPSE_LOCK_SECRET', 'a'.repeat(32))
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost:54321')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon')
  getUser = vi.fn().mockResolvedValue({ data: { user: { id: ID } } })
  vi.mocked(createServerClient).mockImplementation(((_u: string, _k: string, opts: { cookies: CookieOptions }) => {
    cookieOptions = opts.cookies
    return { auth: { getUser, signOut: vi.fn() } }
  }) as never)
  vi.mocked(isAllowedUser).mockReturnValue(true)
  vi.mocked(checkLock).mockResolvedValue({ blocked: null, lock: LOCK })
})

describe('updateSession : contexte transmis à la page', () => {
  it("ne transmet pas des en-têtes x-synapse-* usurpés sur /login sans session", async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    const res = await updateSession(req('/login'))
    const f = forwarded(res)
    expect(f['x-synapse-user-id']).toBeUndefined()
    expect(f['x-synapse-lock']).toBeUndefined()
    expect(Object.values(f)).not.toContain(OTHER)
  })

  it('transmet l’utilisateur et le verrouillage, en écrasant les valeurs usurpées', async () => {
    const res = await updateSession(req('/'))
    const f = forwarded(res)
    expect(f['x-synapse-user-id']).toBe(ID)
    expect(f['x-synapse-lock']).toBe(encodeLock(LOCK))
    expect(f['x-synapse-sig']).toBe(await signRequestContext(ID, encodeLock(LOCK)))
  })

  it('sans SYNAPSE_LOCK_SECRET, ne transmet rien (la page relit tout)', async () => {
    vi.stubEnv('SYNAPSE_LOCK_SECRET', '')
    const f = forwarded(await updateSession(req('/')))
    expect(f['x-synapse-user-id']).toBeUndefined()
    expect(f['x-synapse-sig']).toBeUndefined()
  })

  it("sans état de verrouillage, ne transmet rien et retire les valeurs usurpées", async () => {
    vi.mocked(checkLock).mockResolvedValue({ blocked: null, lock: null })
    const f = forwarded(await updateSession(req('/')))
    expect(f['x-synapse-user-id']).toBeUndefined()
    expect(f['x-synapse-lock']).toBeUndefined()
    expect(f['x-synapse-sig']).toBeUndefined()
  })

  it('renvoie telle quelle la réponse bloquée', async () => {
    const blocked = NextResponse.redirect('http://localhost:3000/unlock')
    vi.mocked(checkLock).mockResolvedValue({ blocked, lock: LOCK })
    expect(await updateSession(req('/settings'))).toBe(blocked)
  })

  it('garde le cookie de session rafraîchi, le Cache-Control et les en-têtes transmis', async () => {
    getUser.mockImplementation(async () => {
      cookieOptions.setAll([{ name: 'sb-token', value: 'fresh', options: { path: '/' } }], { 'Cache-Control': 'private, no-store' })
      return { data: { user: { id: ID } } }
    })
    const res = await updateSession(req('/'))
    expect(res.cookies.get('sb-token')?.value).toBe('fresh')
    expect(res.headers.get('cache-control')).toBe('private, no-store')
    expect(forwarded(res)['x-synapse-user-id']).toBe(ID)
  })

  it('garde le cookie posé par checkLock sur la réponse reconstruite', async () => {
    vi.mocked(checkLock).mockImplementation(async (_r, _s, _u, response) => {
      response.cookies.set('synapse_unlock', 'tok', { path: '/' })
      return { blocked: null, lock: LOCK }
    })
    const res = await updateSession(req('/'))
    expect(res.cookies.get('synapse_unlock')?.value).toBe('tok')
  })

  it('garde plusieurs Set-Cookie avec leurs attributs sur la réponse reconstruite', async () => {
    vi.mocked(checkLock).mockImplementation(async (_r, _s, _u, response) => {
      response.cookies.set('synapse_unlock', 'tok', { path: '/', httpOnly: true, maxAge: 300, sameSite: 'lax' })
      response.cookies.set('other', 'x', { path: '/', httpOnly: true, maxAge: 60 })
      return { blocked: null, lock: LOCK }
    })
    const res = await updateSession(req('/'))
    const setCookie = res.headers.getSetCookie()
    expect(setCookie).toHaveLength(2)
    expect(setCookie.find((c) => c.startsWith('synapse_unlock='))).toMatch(/Max-Age=300.*HttpOnly.*SameSite=lax|HttpOnly.*Max-Age=300/i)
    expect(setCookie.find((c) => c.startsWith('other='))).toMatch(/Max-Age=60/)
  })
})
