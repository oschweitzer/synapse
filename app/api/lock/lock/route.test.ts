import { describe, it, expect, vi, beforeEach } from 'vitest'
import { UNLOCK_COOKIE, clearUnlockCookie } from '@/lib/lock/token'
import { jsonRequest } from '@/test/next-mock'
import { POST } from './route'

beforeEach(() => {
  vi.stubEnv('SYNAPSE_LOCK_SECRET', 'a'.repeat(32))
})

// Route sans session : le middleware la protège, elle ne fait qu'effacer le cookie.
describe('POST /api/lock/lock', () => {
  it('redirige en 303 vers /unlock et efface le cookie de déverrouillage', async () => {
    const res = await POST(jsonRequest('/api/lock/lock', { contentType: null }))
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe('http://localhost:3000/unlock')
    const { options } = clearUnlockCookie()
    expect(res.cookies.get(UNLOCK_COOKIE)).toMatchObject({
      value: '',
      maxAge: 0,
      httpOnly: true,
      sameSite: 'lax',
      path: options.path,
    })
  })
})
