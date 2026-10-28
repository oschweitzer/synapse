import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { MAX_FAILURES, attemptCode, attemptMessage } from '@/lib/lock/server'
import { checkCode } from '@/lib/lock/code'

vi.mock('@/lib/lock/code', () => ({ checkCode: vi.fn() }))

const NOW = new Date('2026-01-01T12:00:00Z')
const ROW = { code_hash: 'h', code_salt: 's', idle_minutes: 5, epoch: 2, locked_until: null as string | null }
const inSeconds = (s: number) => new Date(NOW.getTime() + s * 1000).toISOString()

type Failure = { failed_attempts: number; locked_until: string | null }

function fakeSupabase(
  opts: {
    row?: typeof ROW | null
    error?: unknown
    failure?: Failure[] | null
    failureError?: unknown
    resetError?: unknown
  } = {},
) {
  const { row = ROW, error = null, failure = [{ failed_attempts: 1, locked_until: null }], failureError, resetError } = opts
  const gt = vi.fn(async () => ({ error: resetError ?? null }))
  const update = vi.fn(() => ({ gt }))
  const rpc = vi.fn(async () => ({ data: failure, error: failureError ?? null }))
  const signOut = vi.fn(async () => ({ error: null }))
  const from = vi.fn(() => ({
    select: () => ({ maybeSingle: async () => ({ data: row, error }) }),
    update,
  }))
  const client = { schema: () => ({ from, rpc }), auth: { signOut } } as unknown as SupabaseClient
  return { client, update, gt, rpc, signOut }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('attemptCode', () => {
  it('lève l’erreur de lecture Supabase', async () => {
    const error = new Error('db down')
    const { client } = fakeSupabase({ row: null, error })
    await expect(attemptCode(client, '123456')).rejects.toBe(error)
  })

  it('renvoie « none » sans ligne de verrouillage', async () => {
    const { client } = fakeSupabase({ row: null })
    expect(await attemptCode(client, '123456')).toEqual({ ok: false, reason: 'none' })
    expect(checkCode).not.toHaveBeenCalled()
  })

  it('temporise quand locked_until est dans le futur, sans vérifier le code', async () => {
    const { client, rpc } = fakeSupabase({ row: { ...ROW, locked_until: inSeconds(30.2) } })
    expect(await attemptCode(client, '123456')).toEqual({ ok: false, reason: 'throttled', retryAfter: 31 })
    expect(checkCode).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
  })

  it('ignore un locked_until déjà passé', async () => {
    vi.mocked(checkCode).mockResolvedValue(true)
    const { client } = fakeSupabase({ row: { ...ROW, locked_until: inSeconds(-5) } })
    expect((await attemptCode(client, '123456')).ok).toBe(true)
  })

  it('bon code : renvoie la configuration et remet les échecs à zéro', async () => {
    vi.mocked(checkCode).mockResolvedValue(true)
    const { client, update, gt } = fakeSupabase()
    expect(await attemptCode(client, '123456')).toEqual({ ok: true, config: { idleMinutes: 5, epoch: 2 } })
    expect(checkCode).toHaveBeenCalledWith('123456', 'h', 's')
    expect(update).toHaveBeenCalledWith({ failed_attempts: 0, locked_until: null })
    expect(gt).toHaveBeenCalledWith('epoch', 0)
  })

  it('bon code : reste valide si la remise à zéro échoue, et journalise', async () => {
    vi.mocked(checkCode).mockResolvedValue(true)
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { client } = fakeSupabase({ resetError: new Error('reset') })
    expect((await attemptCode(client, '123456')).ok).toBe(true)
    expect(log).toHaveBeenCalled()
  })

  it('mauvais code sous le seuil : « wrong »', async () => {
    vi.mocked(checkCode).mockResolvedValue(false)
    const { client, rpc, signOut } = fakeSupabase({ failure: [{ failed_attempts: MAX_FAILURES - 1, locked_until: null }] })
    expect(await attemptCode(client, '000000')).toEqual({ ok: false, reason: 'wrong' })
    expect(rpc).toHaveBeenCalledWith('register_lock_failure')
    expect(signOut).not.toHaveBeenCalled()
  })

  it('mauvais code avec locked_until futur : temporisation', async () => {
    vi.mocked(checkCode).mockResolvedValue(false)
    const { client } = fakeSupabase({ failure: [{ failed_attempts: 4, locked_until: inSeconds(120) }] })
    expect(await attemptCode(client, '000000')).toEqual({ ok: false, reason: 'throttled', retryAfter: 120 })
  })

  it('mauvais code sans ligne renvoyée par la fonction : « wrong »', async () => {
    vi.mocked(checkCode).mockResolvedValue(false)
    const { client } = fakeSupabase({ failure: null })
    expect(await attemptCode(client, '000000')).toEqual({ ok: false, reason: 'wrong' })
  })

  it(`ferme la session à ${MAX_FAILURES} échecs`, async () => {
    expect(MAX_FAILURES).toBe(10)
    vi.mocked(checkCode).mockResolvedValue(false)
    const { client, signOut } = fakeSupabase({ failure: [{ failed_attempts: MAX_FAILURES, locked_until: inSeconds(60) }] })
    expect(await attemptCode(client, '000000')).toEqual({ ok: false, reason: 'signed-out' })
    expect(signOut).toHaveBeenCalledOnce()
  })

  it('lève l’erreur de la fonction register_lock_failure', async () => {
    vi.mocked(checkCode).mockResolvedValue(false)
    const failureError = new Error('rpc')
    const { client } = fakeSupabase({ failureError })
    await expect(attemptCode(client, '000000')).rejects.toBe(failureError)
  })
})

describe('attemptMessage', () => {
  const throttled = (retryAfter?: number) => attemptMessage({ ok: false, reason: 'throttled', retryAfter })

  it('formate la durée d’attente', () => {
    expect(throttled(30)).toContain('30 s')
    expect(throttled(0)).toContain('1 s')
    expect(throttled(undefined)).toContain('1 s')
    expect(throttled(600)).toContain('10 min')
    expect(throttled(7200)).toContain('2 h')
  })

  it('décrit les autres échecs', () => {
    expect(attemptMessage({ ok: false, reason: 'signed-out' })).toContain('déconnecté')
    expect(attemptMessage({ ok: false, reason: 'none' })).toContain('pas activé')
    expect(attemptMessage({ ok: false, reason: 'wrong' })).toBe('Code incorrect.')
  })
})
