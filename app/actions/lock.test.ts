import { describe, it, expect, vi, beforeEach } from 'vitest'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { attemptCode } from '@/lib/lock/server'
import { readLockConfig } from '@/lib/lock/config'
import { hashCode } from '@/lib/lock/code'
import { UNLOCK_COOKIE, isUnlocked } from '@/lib/lock/token'
import { mockServerClient, testUser } from '@/test/supabase-mock'
import { cookieJar, expectRedirect, form, throwRedirect } from '@/test/next-mock'
import { disableLock, removePasskey, saveLockCode, saveLockIdle } from './lock'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: vi.fn() }))
vi.mock('@/lib/lock/server', () => ({ attemptCode: vi.fn() }))
vi.mock('@/lib/lock/config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/lock/config')>()),
  readLockConfig: vi.fn(),
}))
// scrypt est volontairement lent : seule la validation du nouveau code reste réelle.
vi.mock('@/lib/lock/code', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/lock/code')>()),
  hashCode: vi.fn(),
}))

const ID = '11111111-1111-4111-8111-111111111111'
const to = (code: string) => `/settings?lock=${code}`
const boom = { message: 'boom' }
let jar: ReturnType<typeof cookieJar>

function setup(opts: Parameters<typeof mockServerClient>[0] = {}) {
  return mockServerClient({ user: testUser(), ...opts })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('SYNAPSE_LOCK_SECRET', 'a'.repeat(32))
  vi.mocked(redirect).mockImplementation(throwRedirect)
  jar = cookieJar()
  vi.mocked(cookies).mockResolvedValue(jar as never)
  vi.mocked(hashCode).mockResolvedValue({ hash: 'h', salt: 's' })
  vi.mocked(readLockConfig).mockResolvedValue(null)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('saveLockCode', () => {
  const fields = { code: 'secret-1', confirm: 'secret-1', current: '' }

  it('redirige vers /login sans session', async () => {
    setup({ user: null })
    await expectRedirect(saveLockCode(form(fields)), '/login')
  })

  it('refuse un code trop court', async () => {
    setup()
    await expectRedirect(saveLockCode(form({ ...fields, code: 'abcde', confirm: 'abcde' })), to('short'))
  })

  it('refuse une confirmation différente', async () => {
    setup()
    await expectRedirect(saveLockCode(form({ ...fields, confirm: 'autre-chose' })), to('mismatch'))
  })

  it('premier réglage : enregistre époque 1, délai 5 min, compteur à zéro, et déverrouille', async () => {
    const { calls } = setup({ tables: { 'synapse.lock': { data: null } } })
    await expectRedirect(saveLockCode(form(fields)), to('enabled'))
    expect(attemptCode).not.toHaveBeenCalled()
    const upsert = calls.find((c) => c.method === 'upsert')
    expect(upsert?.args[0]).toEqual({
      user_id: 'u1',
      code_hash: 'h',
      code_salt: 's',
      idle_minutes: 5,
      epoch: 1,
      failed_attempts: 0,
      locked_until: null,
    })
    expect(jar.set).toHaveBeenCalledWith(UNLOCK_COOKIE, expect.any(String), expect.objectContaining({ httpOnly: true }))
    expect(await isUnlocked(jar.set.mock.calls[0][1], 'u1', 1)).toBe(true)
  })

  it('code actuel faux : la redirection ?lock=current sort du try/catch (elle ne devient pas ?lock=save)', async () => {
    const { calls } = setup()
    vi.mocked(readLockConfig).mockResolvedValue({ idleMinutes: 15, epoch: 2 })
    vi.mocked(attemptCode).mockResolvedValue({ ok: false, reason: 'wrong' })
    await expectRedirect(saveLockCode(form({ ...fields, current: 'faux' })), to('current'))
    expect(calls.some((c) => c.method === 'upsert')).toBe(false)
    expect(jar.set).not.toHaveBeenCalled()
  })

  it('temporisation : indique le délai restant', async () => {
    setup()
    vi.mocked(readLockConfig).mockResolvedValue({ idleMinutes: 15, epoch: 2 })
    vi.mocked(attemptCode).mockResolvedValue({ ok: false, reason: 'throttled', retryAfter: 30 })
    await expectRedirect(saveLockCode(form({ ...fields, current: 'x' })), to('throttled-30'))
  })

  it('trop d’échecs (déconnecté) : redirige vers /login', async () => {
    setup()
    vi.mocked(readLockConfig).mockResolvedValue({ idleMinutes: 15, epoch: 2 })
    vi.mocked(attemptCode).mockResolvedValue({ ok: false, reason: 'signed-out' })
    await expectRedirect(saveLockCode(form({ ...fields, current: 'x' })), '/login')
  })

  it('changement de code : époque + 1, délai conservé', async () => {
    const { calls } = setup({ tables: { 'synapse.lock': { data: null } } })
    vi.mocked(readLockConfig).mockResolvedValue({ idleMinutes: 15, epoch: 2 })
    vi.mocked(attemptCode).mockResolvedValue({ ok: true, config: { idleMinutes: 15, epoch: 2 } })
    await expectRedirect(saveLockCode(form({ ...fields, current: 'ancien' })), to('changed'))
    expect(calls.find((c) => c.method === 'upsert')?.args[0]).toMatchObject({ epoch: 3, idle_minutes: 15 })
    expect(await isUnlocked(jar.set.mock.calls[0][1], 'u1', 3)).toBe(true)
  })

  it('erreur Supabase : ?lock=save, sans cookie', async () => {
    setup({ tables: { 'synapse.lock': { error: boom } } })
    await expectRedirect(saveLockCode(form(fields)), to('save'))
    expect(jar.set).not.toHaveBeenCalled()
  })
})

describe('saveLockIdle', () => {
  it('refuse un délai hors des choix, avant tout appel', async () => {
    await expectRedirect(saveLockIdle(form({ idle_minutes: '7' })), to('save'))
    expect(createClient).not.toHaveBeenCalled()
  })

  it('redirige vers /login sans session', async () => {
    setup({ user: null })
    await expectRedirect(saveLockIdle(form({ idle_minutes: '15' })), '/login')
  })

  it('refuse si le verrouillage n’est pas activé', async () => {
    const { calls } = setup()
    await expectRedirect(saveLockIdle(form({ idle_minutes: '15' })), to('save'))
    expect(calls.some((c) => c.method === 'update')).toBe(false)
  })

  it('erreur Supabase : ?lock=save', async () => {
    setup({ tables: { 'synapse.lock': { error: boom } } })
    vi.mocked(readLockConfig).mockResolvedValue({ idleMinutes: 5, epoch: 4 })
    await expectRedirect(saveLockIdle(form({ idle_minutes: '15' })), to('save'))
    expect(jar.set).not.toHaveBeenCalled()
  })

  it('met à jour le délai et réémet le cookie avec la même époque', async () => {
    const { calls } = setup({ tables: { 'synapse.lock': { data: null } } })
    vi.mocked(readLockConfig).mockResolvedValue({ idleMinutes: 5, epoch: 4 })
    await expectRedirect(saveLockIdle(form({ idle_minutes: '15' })), to('idle'))
    expect(calls.find((c) => c.method === 'update')?.args[0]).toEqual({ idle_minutes: 15 })
    expect(await isUnlocked(jar.set.mock.calls[0][1], 'u1', 4)).toBe(true)
  })
})

describe('disableLock', () => {
  const tables = { 'synapse.lock_passkeys': { data: null }, 'synapse.lock': { data: null } }

  it('redirige vers /login sans session', async () => {
    setup({ user: null })
    await expectRedirect(disableLock(form({ current: 'x' })), '/login')
  })

  it('code actuel faux : refusé, rien n’est supprimé', async () => {
    const { calls } = setup({ tables })
    vi.mocked(attemptCode).mockResolvedValue({ ok: false, reason: 'wrong' })
    await expectRedirect(disableLock(form({ current: 'faux' })), to('current'))
    expect(calls.some((c) => c.method === 'delete')).toBe(false)
  })

  it('erreur à la suppression des empreintes : ?lock=save, le code reste', async () => {
    const { calls } = setup({ tables: { ...tables, 'synapse.lock_passkeys': { error: boom } } })
    vi.mocked(attemptCode).mockResolvedValue({ ok: true, config: { idleMinutes: 5, epoch: 1 } })
    await expectRedirect(disableLock(form({ current: 'ok' })), to('save'))
    expect(calls.filter((c) => c.method === 'delete').map((c) => c.table)).toEqual(['lock_passkeys'])
  })

  it('supprime empreintes puis code de l’utilisateur et efface le cookie', async () => {
    const { calls } = setup({ tables })
    vi.mocked(attemptCode).mockResolvedValue({ ok: true, config: { idleMinutes: 5, epoch: 1 } })
    await expectRedirect(disableLock(form({ current: 'ok' })), to('disabled'))
    expect(calls.filter((c) => c.method === 'delete').map((c) => c.table)).toEqual(['lock_passkeys', 'lock'])
    expect(calls.filter((c) => c.method === 'eq')).toEqual([
      expect.objectContaining({ table: 'lock_passkeys', args: ['user_id', 'u1'] }),
      expect.objectContaining({ table: 'lock', args: ['user_id', 'u1'] }),
    ])
    expect(jar.set).toHaveBeenCalledWith(UNLOCK_COOKIE, '', expect.objectContaining({ maxAge: 0 }))
  })
})

describe('removePasskey', () => {
  it('refuse un id invalide, avant tout appel', async () => {
    await expectRedirect(removePasskey(form({ id: 'nope' })), to('save'))
    expect(createClient).not.toHaveBeenCalled()
  })

  it('redirige vers /login sans session', async () => {
    setup({ user: null })
    await expectRedirect(removePasskey(form({ id: ID })), '/login')
  })

  it('erreur Supabase : ?lock=save', async () => {
    setup({ tables: { 'synapse.lock_passkeys': { error: boom } } })
    await expectRedirect(removePasskey(form({ id: ID })), to('save'))
  })

  it('révoque l’empreinte', async () => {
    const { calls } = setup({ tables: { 'synapse.lock_passkeys': { data: null } } })
    await expectRedirect(removePasskey(form({ id: ID })), to('revoked'))
    expect(calls).toContainEqual(expect.objectContaining({ method: 'eq', args: ['id', ID] }))
  })
})
