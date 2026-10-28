import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { enforceLock } from '@/lib/lock/gate'
import { readLockConfig } from '@/lib/lock/config'
import { UNLOCK_COOKIE, issueUnlockCookie } from '@/lib/lock/token'

vi.mock('@/lib/lock/config', () => ({ readLockConfig: vi.fn() }))

const USER = 'user-1'
const CONFIG = { idleMinutes: 5, epoch: 2 }
const supabase = {} as SupabaseClient

function request(path: string, init: { method?: string; headers?: Record<string, string> } = {}) {
  return new NextRequest(`http://localhost:3000${path}`, { method: init.method ?? 'GET', headers: init.headers })
}

async function run(req: NextRequest) {
  const response = NextResponse.next()
  const redirect = vi.fn((url: URL) => NextResponse.redirect(url))
  const result = await enforceLock(req, supabase, USER, response, redirect)
  return { result, response, redirect }
}

async function unlockedHeaders(extra: Record<string, string> = {}) {
  const { value } = await issueUnlockCookie(USER, CONFIG.epoch, CONFIG.idleMinutes)
  return { cookie: `${UNLOCK_COOKIE}=${value}`, ...extra }
}

beforeEach(() => {
  vi.stubEnv('SYNAPSE_LOCK_SECRET', 'a'.repeat(32))
  vi.mocked(readLockConfig).mockResolvedValue(CONFIG)
})

describe('enforceLock', () => {
  it("laisse tout passer sans verrouillage activé, sans poser de cookie", async () => {
    vi.mocked(readLockConfig).mockResolvedValue(null)
    const { result, response } = await run(request('/settings'))
    expect(result).toBeNull()
    expect(response.cookies.get(UNLOCK_COOKIE)).toBeUndefined()
  })

  it('laisse passer avec un cookie valide et réémet le cookie', async () => {
    const { result, response } = await run(request('/settings', { headers: await unlockedHeaders() }))
    expect(result).toBeNull()
    expect(response.cookies.get(UNLOCK_COOKIE)?.value).toBeTruthy()
  })

  it('un cookie pour une autre époque ne déverrouille pas', async () => {
    const { value } = await issueUnlockCookie(USER, CONFIG.epoch + 1, CONFIG.idleMinutes)
    const { result, redirect } = await run(request('/settings', { headers: { cookie: `${UNLOCK_COOKIE}=${value}` } }))
    expect(result).not.toBeNull()
    expect(redirect).toHaveBeenCalledOnce()
  })

  it('redirige un GET verrouillé vers /unlock en gardant la destination', async () => {
    const { result, redirect } = await run(request('/settings?tab=admin'))
    expect(result?.status).toBe(307)
    const url = redirect.mock.calls[0][0]
    expect(url.pathname).toBe('/unlock')
    expect(url.search).toBe(`?next=${encodeURIComponent('/settings?tab=admin')}`)
  })

  it("redirige vers /unlock?next=%2Fsettings", async () => {
    const { redirect } = await run(request('/settings'))
    expect(redirect.mock.calls[0][0].search).toBe('?next=%2Fsettings')
  })

  it("laisse passer GET / verrouillé, mais redirige POST / sans destination", async () => {
    expect((await run(request('/'))).result).toBeNull()
    const { result, redirect } = await run(request('/', { method: 'POST' }))
    expect(result).not.toBeNull()
    const url = redirect.mock.calls[0][0]
    expect(url.pathname).toBe('/unlock')
    expect(url.search).toBe('')
  })

  it('laisse passer GET /unlock verrouillé, mais pas POST /unlock', async () => {
    expect((await run(request('/unlock'))).result).toBeNull()
    const { result, redirect } = await run(request('/unlock', { method: 'POST' }))
    expect(result).not.toBeNull()
    expect(redirect).toHaveBeenCalledOnce()
  })

  it('laisse passer les routes API de déverrouillage', async () => {
    for (const path of [
      '/api/lock/verify',
      '/api/lock/lock',
      '/api/lock/passkey/auth-options',
      '/api/lock/passkey/auth-verify',
    ]) {
      expect((await run(request(path, { method: 'POST' }))).result, path).toBeNull()
    }
  })

  it("n'exempte jamais une Server Action, même sur / ou /unlock", async () => {
    for (const path of ['/', '/unlock', '/api/lock/verify', '/cash']) {
      const { result, redirect } = await run(request(path, { method: 'POST', headers: { 'next-action': 'abc' } }))
      expect(result, path).not.toBeNull()
      if (path.startsWith('/api/')) expect(result?.status).toBe(401)
      else expect(redirect).toHaveBeenCalledOnce()
    }
  })

  it('répond 401 JSON sur une autre route API verrouillée', async () => {
    const { result, redirect } = await run(request('/api/other'))
    expect(result?.status).toBe(401)
    expect(await result?.json()).toEqual({ error: 'locked' })
    expect(redirect).not.toHaveBeenCalled()
  })

  it('reste verrouillé quand la lecture de la configuration échoue', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(readLockConfig).mockRejectedValue(new Error('db down'))
    const { result, redirect } = await run(request('/settings', { headers: await unlockedHeaders() }))
    expect(result).not.toBeNull()
    expect(redirect).toHaveBeenCalledOnce()
    expect(error).toHaveBeenCalled()
  })

  it('reste verrouillé quand SYNAPSE_LOCK_SECRET manque', async () => {
    const headers = await unlockedHeaders()
    vi.stubEnv('SYNAPSE_LOCK_SECRET', '')
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { result, redirect, response } = await run(request('/settings', { headers }))
    expect(result).not.toBeNull()
    expect(redirect).toHaveBeenCalledOnce()
    expect(response.cookies.get(UNLOCK_COOKIE)).toBeUndefined()
    expect(error).toHaveBeenCalled()
  })
})
