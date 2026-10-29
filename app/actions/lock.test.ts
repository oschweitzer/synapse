import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { revalidatePath } from 'next/cache'
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
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
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
const NOW = new Date('2026-05-01T10:00:00Z')
const result = (code: string) => ({ code, at: NOW.getTime() })
const boom = { message: 'boom' }
let jar: ReturnType<typeof cookieJar>

function setup(opts: Parameters<typeof mockServerClient>[0] = {}) {
  return mockServerClient({ user: testUser(), ...opts })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  vi.stubEnv('SYNAPSE_LOCK_SECRET', 'a'.repeat(32))
  vi.mocked(redirect).mockImplementation(throwRedirect)
  jar = cookieJar()
  vi.mocked(cookies).mockResolvedValue(jar as never)
  vi.mocked(hashCode).mockResolvedValue({ hash: 'h', salt: 's' })
  vi.mocked(readLockConfig).mockResolvedValue(null)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
})

describe('saveLockCode', () => {
  const fields = { code: 'secret-1', confirm: 'secret-1', current: '' }

  it('redirige vers /login sans session', async () => {
    setup({ user: null })
    await expectRedirect(saveLockCode(null, form(fields)), '/login')
  })

  it('refuse un code trop court', async () => {
    setup()
    expect(await saveLockCode(null, form({ ...fields, code: 'abcde', confirm: 'abcde' }))).toEqual(result('short'))
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('refuse une confirmation différente', async () => {
    setup()
    expect(await saveLockCode(null, form({ ...fields, confirm: 'autre-chose' }))).toEqual(result('mismatch'))
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('premier réglage : enregistre époque 1, délai 5 min, compteur à zéro, et déverrouille', async () => {
    const { calls } = setup({ tables: { 'synapse.lock': { data: null } } })
    expect(await saveLockCode(null, form(fields))).toEqual(result('enabled'))
    expect(revalidatePath).toHaveBeenCalledWith('/settings')
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

  it('premier réglage avec un champ « current » périmé : le message reste « enabled »', async () => {
    setup({ tables: { 'synapse.lock': { data: null } } })
    expect(await saveLockCode(null, form({ ...fields, current: 'ancien' }))).toEqual(result('enabled'))
    expect(attemptCode).not.toHaveBeenCalled()
  })

  it('code actuel faux : renvoie « current » (il n’est pas avalé en « save » par le try/catch)', async () => {
    const { calls } = setup()
    vi.mocked(readLockConfig).mockResolvedValue({ idleMinutes: 15, epoch: 2 })
    vi.mocked(attemptCode).mockResolvedValue({ ok: false, reason: 'wrong' })
    expect(await saveLockCode(null, form({ ...fields, current: 'faux' }))).toEqual(result('current'))
    expect(revalidatePath).not.toHaveBeenCalled()
    expect(calls.some((c) => c.method === 'upsert')).toBe(false)
    expect(jar.set).not.toHaveBeenCalled()
  })

  it('temporisation : indique le délai restant', async () => {
    setup()
    vi.mocked(readLockConfig).mockResolvedValue({ idleMinutes: 15, epoch: 2 })
    vi.mocked(attemptCode).mockResolvedValue({ ok: false, reason: 'throttled', retryAfter: 30 })
    expect(await saveLockCode(null, form({ ...fields, current: 'x' }))).toEqual(result('throttled-30'))
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('trop d’échecs (déconnecté) : redirige vers /login', async () => {
    setup()
    vi.mocked(readLockConfig).mockResolvedValue({ idleMinutes: 15, epoch: 2 })
    vi.mocked(attemptCode).mockResolvedValue({ ok: false, reason: 'signed-out' })
    await expectRedirect(saveLockCode(null, form({ ...fields, current: 'x' })), '/login')
  })

  it('changement de code : époque + 1, délai conservé', async () => {
    const { calls } = setup({ tables: { 'synapse.lock': { data: null } } })
    vi.mocked(readLockConfig).mockResolvedValue({ idleMinutes: 15, epoch: 2 })
    vi.mocked(attemptCode).mockResolvedValue({ ok: true, config: { idleMinutes: 15, epoch: 2 } })
    expect(await saveLockCode(null, form({ ...fields, current: 'ancien' }))).toEqual(result('changed'))
    expect(revalidatePath).toHaveBeenCalledWith('/settings')
    expect(calls.find((c) => c.method === 'upsert')?.args[0]).toMatchObject({ epoch: 3, idle_minutes: 15 })
    expect(await isUnlocked(jar.set.mock.calls[0][1], 'u1', 3)).toBe(true)
  })

  it('erreur Supabase : « save », sans cookie', async () => {
    setup({ tables: { 'synapse.lock': { error: boom } } })
    expect(await saveLockCode(null, form(fields))).toEqual(result('save'))
    expect(revalidatePath).not.toHaveBeenCalled()
    expect(jar.set).not.toHaveBeenCalled()
  })
})

describe('saveLockIdle', () => {
  it('refuse un délai hors des choix, avant tout appel', async () => {
    expect(await saveLockIdle(null, form({ idle_minutes: '7' }))).toEqual(result('save'))
    expect(revalidatePath).not.toHaveBeenCalled()
    expect(createClient).not.toHaveBeenCalled()
  })

  it('redirige vers /login sans session', async () => {
    setup({ user: null })
    await expectRedirect(saveLockIdle(null, form({ idle_minutes: '15' })), '/login')
  })

  it('refuse si le verrouillage n’est pas activé', async () => {
    const { calls } = setup()
    expect(await saveLockIdle(null, form({ idle_minutes: '15' }))).toEqual(result('save'))
    expect(revalidatePath).not.toHaveBeenCalled()
    expect(calls.some((c) => c.method === 'update')).toBe(false)
  })

  it('erreur Supabase : « save »', async () => {
    setup({ tables: { 'synapse.lock': { error: boom } } })
    vi.mocked(readLockConfig).mockResolvedValue({ idleMinutes: 5, epoch: 4 })
    expect(await saveLockIdle(null, form({ idle_minutes: '15' }))).toEqual(result('save'))
    expect(revalidatePath).not.toHaveBeenCalled()
    expect(jar.set).not.toHaveBeenCalled()
  })

  it('met à jour le délai et réémet le cookie avec la même époque', async () => {
    const { calls } = setup({ tables: { 'synapse.lock': { data: null } } })
    vi.mocked(readLockConfig).mockResolvedValue({ idleMinutes: 5, epoch: 4 })
    expect(await saveLockIdle(null, form({ idle_minutes: '15' }))).toEqual(result('idle'))
    expect(revalidatePath).toHaveBeenCalledWith('/settings')
    expect(calls.find((c) => c.method === 'update')?.args[0]).toEqual({ idle_minutes: 15 })
    expect(await isUnlocked(jar.set.mock.calls[0][1], 'u1', 4)).toBe(true)
  })
})

describe('disableLock', () => {
  const tables = { 'synapse.lock_passkeys': { data: null }, 'synapse.lock': { data: null } }

  it('redirige vers /login sans session', async () => {
    setup({ user: null })
    await expectRedirect(disableLock(null, form({ current: 'x' })), '/login')
  })

  it('code actuel faux : refusé, rien n’est supprimé', async () => {
    const { calls } = setup({ tables })
    vi.mocked(attemptCode).mockResolvedValue({ ok: false, reason: 'wrong' })
    expect(await disableLock(null, form({ current: 'faux' }))).toEqual(result('current'))
    expect(revalidatePath).not.toHaveBeenCalled()
    expect(calls.some((c) => c.method === 'delete')).toBe(false)
  })

  it('erreur à la suppression des empreintes : « save », le code reste', async () => {
    const { calls } = setup({ tables: { ...tables, 'synapse.lock_passkeys': { error: boom } } })
    vi.mocked(attemptCode).mockResolvedValue({ ok: true, config: { idleMinutes: 5, epoch: 1 } })
    expect(await disableLock(null, form({ current: 'ok' }))).toEqual(result('save'))
    expect(revalidatePath).not.toHaveBeenCalled()
    expect(calls.filter((c) => c.method === 'delete').map((c) => c.table)).toEqual(['lock_passkeys'])
  })

  it('supprime empreintes puis code de l’utilisateur et efface le cookie', async () => {
    const { calls } = setup({ tables })
    vi.mocked(attemptCode).mockResolvedValue({ ok: true, config: { idleMinutes: 5, epoch: 1 } })
    expect(await disableLock(null, form({ current: 'ok' }))).toEqual(result('disabled'))
    expect(revalidatePath).toHaveBeenCalledWith('/settings')
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
    expect(await removePasskey(null, form({ id: 'nope' }))).toEqual(result('save'))
    expect(revalidatePath).not.toHaveBeenCalled()
    expect(createClient).not.toHaveBeenCalled()
  })

  it('redirige vers /login sans session', async () => {
    setup({ user: null })
    await expectRedirect(removePasskey(null, form({ id: ID })), '/login')
  })

  it('erreur Supabase : « save »', async () => {
    setup({ tables: { 'synapse.lock_passkeys': { error: boom } } })
    expect(await removePasskey(null, form({ id: ID }))).toEqual(result('save'))
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('révoque l’empreinte', async () => {
    const { calls } = setup({ tables: { 'synapse.lock_passkeys': { data: [{ id: ID }] } } })
    expect(await removePasskey(null, form({ id: ID }))).toEqual(result('revoked'))
    expect(revalidatePath).toHaveBeenCalledWith('/settings')
    expect(calls).toContainEqual(expect.objectContaining({ method: 'eq', args: ['id', ID] }))
    expect(calls).toContainEqual(expect.objectContaining({ method: 'eq', args: ['user_id', 'u1'] }))
  })

  it('aucune ligne supprimée (empreinte déjà retirée) : « save », sans revalidation', async () => {
    setup({ tables: { 'synapse.lock_passkeys': { data: [] } } })
    expect(await removePasskey(null, form({ id: ID }))).toEqual(result('save'))
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})
