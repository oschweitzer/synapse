import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  CHALLENGE_COOKIE,
  UNLOCK_COOKIE,
  clearChallengeCookie,
  clearUnlockCookie,
  isUnlocked,
  issueChallengeCookie,
  issueUnlockCookie,
  readChallenge,
} from '@/lib/lock/token'

const START = new Date('2026-01-01T12:00:00Z')
const USER = 'user-1'
const EPOCH = 3

/** Avance l'horloge (seul `Date` est simulé : Web Crypto continue de résoudre ses promesses). */
const advance = (seconds: number) => vi.setSystemTime(new Date(START.getTime() + seconds * 1000))

beforeEach(() => {
  vi.stubEnv('SYNAPSE_LOCK_SECRET', 'a'.repeat(32))
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(START)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('issueUnlockCookie', () => {
  it('pose un cookie httpOnly, lax, sur /, avec maxAge en secondes', async () => {
    const cookie = await issueUnlockCookie(USER, EPOCH, 5)
    expect(cookie.name).toBe('synapse_unlock')
    expect(cookie.name).toBe(UNLOCK_COOKIE)
    expect(cookie.options).toEqual({ httpOnly: true, secure: false, sameSite: 'lax', path: '/', maxAge: 300 })
  })

  it('est « secure » en production seulement', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    expect((await issueUnlockCookie(USER, EPOCH, 5)).options.secure).toBe(true)
    vi.stubEnv('NODE_ENV', 'development')
    expect((await issueUnlockCookie(USER, EPOCH, 5)).options.secure).toBe(false)
  })

  it('sans inactivité (0) : cookie de session, valable 12 h côté serveur', async () => {
    const cookie = await issueUnlockCookie(USER, EPOCH, 0)
    expect(cookie.options).not.toHaveProperty('maxAge')
    advance(12 * 3600 - 1)
    expect(await isUnlocked(cookie.value, USER, EPOCH)).toBe(true)
    advance(12 * 3600)
    expect(await isUnlocked(cookie.value, USER, EPOCH)).toBe(false)
  })
})

describe('isUnlocked', () => {
  it('accepte un jeton frais, du bon utilisateur et de la bonne époque', async () => {
    const { value } = await issueUnlockCookie(USER, EPOCH, 5)
    expect(await isUnlocked(value, USER, EPOCH)).toBe(true)
  })

  it('refuse un autre utilisateur ou une autre époque', async () => {
    const { value } = await issueUnlockCookie(USER, EPOCH, 5)
    expect(await isUnlocked(value, 'user-2', EPOCH)).toBe(false)
    expect(await isUnlocked(value, USER, EPOCH + 1)).toBe(false)
  })

  it('refuse un jeton absent, sans point, ou commençant par le point', async () => {
    expect(await isUnlocked(undefined, USER, EPOCH)).toBe(false)
    expect(await isUnlocked('', USER, EPOCH)).toBe(false)
    expect(await isUnlocked('sanspoint', USER, EPOCH)).toBe(false)
    expect(await isUnlocked('.signature', USER, EPOCH)).toBe(false)
  })

  it('refuse un jeton dont la charge ou la signature a été modifiée', async () => {
    const { value } = await issueUnlockCookie(USER, EPOCH, 5)
    const cut = value.lastIndexOf('.')
    const payload = value.slice(0, cut)
    const signature = value.slice(cut + 1)
    const forgedPayload = payload.replace(`.${EPOCH}.`, `.${EPOCH + 1}.`)
    expect(await isUnlocked(`${forgedPayload}.${signature}`, USER, EPOCH + 1)).toBe(false)
    const flipped = (signature[0] === 'A' ? 'B' : 'A') + signature.slice(1)
    expect(await isUnlocked(`${payload}.${flipped}`, USER, EPOCH)).toBe(false)
    expect(await isUnlocked(`${payload}.${signature.slice(0, -1)}`, USER, EPOCH)).toBe(false)
  })

  it('expire une fois la durée d’inactivité écoulée', async () => {
    const { value } = await issueUnlockCookie(USER, EPOCH, 5)
    advance(5 * 60 - 1)
    expect(await isUnlocked(value, USER, EPOCH)).toBe(true)
    advance(5 * 60 + 1)
    expect(await isUnlocked(value, USER, EPOCH)).toBe(false)
  })

  it('refuse un jeton signé avec un autre secret', async () => {
    const { value } = await issueUnlockCookie(USER, EPOCH, 5)
    vi.stubEnv('SYNAPSE_LOCK_SECRET', 'b'.repeat(32))
    expect(await isUnlocked(value, USER, EPOCH)).toBe(false)
  })
})

describe('clearUnlockCookie / clearChallengeCookie', () => {
  it('renvoient un cookie vide qui expire immédiatement', () => {
    for (const [cookie, name] of [
      [clearUnlockCookie(), UNLOCK_COOKIE],
      [clearChallengeCookie(), CHALLENGE_COOKIE],
    ] as const) {
      expect(cookie.name).toBe(name)
      expect(cookie.value).toBe('')
      expect(cookie.options).toMatchObject({ httpOnly: true, path: '/', maxAge: 0 })
    }
  })
})

describe('défi WebAuthn', () => {
  it('fait l’aller-retour, y compris avec un point dans le défi', async () => {
    const cookie = await issueChallengeCookie('register', USER, 'abc')
    expect(cookie.name).toBe(CHALLENGE_COOKIE)
    expect(cookie.options).toMatchObject({ httpOnly: true, maxAge: 300 })
    expect(await readChallenge(cookie.value, 'register', USER)).toBe('abc')

    const dotted = await issueChallengeCookie('authenticate', USER, 'a.b.c')
    expect(await readChallenge(dotted.value, 'authenticate', USER)).toBe('a.b.c')
  })

  it('renvoie null pour un autre usage, un autre utilisateur ou un jeton absent', async () => {
    const { value } = await issueChallengeCookie('register', USER, 'abc')
    expect(await readChallenge(value, 'authenticate', USER)).toBeNull()
    expect(await readChallenge(value, 'register', 'user-2')).toBeNull()
    expect(await readChallenge(undefined, 'register', USER)).toBeNull()
  })

  it('expire après 300 s', async () => {
    const { value } = await issueChallengeCookie('register', USER, 'abc')
    advance(299)
    expect(await readChallenge(value, 'register', USER)).toBe('abc')
    advance(300)
    expect(await readChallenge(value, 'register', USER)).toBeNull()
  })

  it('un jeton de déverrouillage n’est pas un défi, et inversement', async () => {
    const unlock = await issueUnlockCookie(USER, EPOCH, 5)
    const challenge = await issueChallengeCookie('register', USER, 'abc')
    expect(await readChallenge(unlock.value, 'register', USER)).toBeNull()
    expect(await isUnlocked(challenge.value, USER, EPOCH)).toBe(false)
  })
})

describe('secret serveur', () => {
  it.each([
    ['manquant', ''],
    ['trop court', 'a'.repeat(31)],
  ])('lève quand SYNAPSE_LOCK_SECRET est %s', async (_label, value) => {
    vi.stubEnv('SYNAPSE_LOCK_SECRET', value)
    await expect(issueUnlockCookie(USER, EPOCH, 5)).rejects.toThrow('SYNAPSE_LOCK_SECRET')
    await expect(issueChallengeCookie('register', USER, 'abc')).rejects.toThrow('SYNAPSE_LOCK_SECRET')
    await expect(isUnlocked('a.b', USER, EPOCH)).rejects.toThrow('SYNAPSE_LOCK_SECRET')
  })
})
