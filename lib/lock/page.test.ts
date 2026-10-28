import { describe, it, expect, vi, beforeEach } from 'vitest'
import { cookies } from 'next/headers'
import type { SupabaseClient } from '@supabase/supabase-js'
import { readLockState } from '@/lib/lock/page'
import { readLockConfig } from '@/lib/lock/config'
import { UNLOCK_COOKIE, issueUnlockCookie } from '@/lib/lock/token'

vi.mock('next/headers', () => ({ cookies: vi.fn() }))
vi.mock('@/lib/lock/config', () => ({ readLockConfig: vi.fn() }))

const USER = 'user-1'
const CONFIG = { idleMinutes: 5, epoch: 2 }
const supabase = {} as SupabaseClient

function withCookie(token: string | undefined) {
  vi.mocked(cookies).mockResolvedValue({
    get: (name: string) => (name === UNLOCK_COOKIE && token !== undefined ? { name, value: token } : undefined),
  } as unknown as Awaited<ReturnType<typeof cookies>>)
}

beforeEach(() => {
  vi.stubEnv('SYNAPSE_LOCK_SECRET', 'a'.repeat(32))
  vi.mocked(readLockConfig).mockResolvedValue(CONFIG)
})

describe('readLockState', () => {
  it("sans configuration : déverrouillé, et les cookies ne sont pas lus", async () => {
    vi.mocked(readLockConfig).mockResolvedValue(null)
    expect(await readLockState(supabase, USER)).toEqual({ config: null, unlocked: true })
    expect(cookies).not.toHaveBeenCalled()
  })

  it('avec un cookie valide : déverrouillé', async () => {
    withCookie((await issueUnlockCookie(USER, CONFIG.epoch, CONFIG.idleMinutes)).value)
    expect(await readLockState(supabase, USER)).toEqual({ config: CONFIG, unlocked: true })
  })

  it('sans cookie ou avec un cookie invalide : verrouillé', async () => {
    withCookie(undefined)
    expect(await readLockState(supabase, USER)).toEqual({ config: CONFIG, unlocked: false })
    withCookie('n-importe.quoi')
    expect(await readLockState(supabase, USER)).toEqual({ config: CONFIG, unlocked: false })
  })

  it('avec un cookie d’une autre époque : verrouillé', async () => {
    withCookie((await issueUnlockCookie(USER, CONFIG.epoch + 1, CONFIG.idleMinutes)).value)
    expect((await readLockState(supabase, USER)).unlocked).toBe(false)
  })

  it('propage l’erreur de lecture de la configuration', async () => {
    vi.mocked(readLockConfig).mockRejectedValue(new Error('db down'))
    await expect(readLockState(supabase, USER)).rejects.toThrow('db down')
  })
})
