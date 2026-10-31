import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  LOCK_HEADER,
  SIGNATURE_HEADER,
  USER_ID_HEADER,
  encodeLock,
  parseRequestContext,
  signRequestContext,
  stripForwardedHeaders,
} from '@/lib/request-context-headers'

const ID = '123e4567-e89b-12d3-a456-426614174000'
const LOCKED = { config: { idleMinutes: 5, epoch: 2 }, unlocked: true }

beforeEach(() => {
  vi.stubEnv('SYNAPSE_LOCK_SECRET', 'a'.repeat(32))
})

/** En-têtes signés pour (user, lock) ; `sig` force une autre signature (ou `null` pour l'omettre). */
async function headers(user: string | null, lock: string | null, sig?: string | null) {
  const h = new Headers()
  if (user !== null) h.set(USER_ID_HEADER, user)
  if (lock !== null) h.set(LOCK_HEADER, lock)
  const signature = sig === undefined ? await signRequestContext(user ?? '', lock ?? '') : sig
  if (signature !== null) h.set(SIGNATURE_HEADER, signature)
  return h
}

describe('stripForwardedHeaders', () => {
  it('retire tout en-tête x-synapse-*, quelle que soit la casse, et garde les autres', async () => {
    const h = new Headers({ cookie: 'a=b', accept: '*/*', 'X-Synapse-User-Id': ID, 'x-synapse-lock': '{}', 'X-SYNAPSE-Other': '1' })
    stripForwardedHeaders(h)
    expect([...h.keys()].sort()).toEqual(['accept', 'cookie'])
  })
})

describe('encodeLock / parseRequestContext', () => {
  it('fait un aller-retour avec et sans configuration', async () => {
    expect(await parseRequestContext(await headers(ID, encodeLock(LOCKED)))).toEqual({ userId: ID, lock: LOCKED })
    const open = { config: null, unlocked: true }
    expect(await parseRequestContext(await headers(ID, encodeLock(open)))).toEqual({ userId: ID, lock: open })
  })

  it("renvoie null si un en-tête manque", async () => {
    expect(await parseRequestContext(await headers(null, encodeLock(LOCKED)))).toBeNull()
    expect(await parseRequestContext(await headers(ID, null))).toBeNull()
  })

  it("renvoie null pour un identifiant qui n'est pas un UUID", async () => {
    expect(await parseRequestContext(await headers('user-1', encodeLock(LOCKED)))).toBeNull()
  })

  it.each([
    ['JSON invalide', '{nope'],
    ['unlocked non booléen', '{"config":null,"unlocked":"true"}'],
    ['idleMinutes décimal', '{"config":{"idleMinutes":1.5,"epoch":2},"unlocked":true}'],
    ['epoch négatif', '{"config":{"idleMinutes":5,"epoch":-1},"unlocked":true}'],
    ['idleMinutes absent', '{"config":{"epoch":2},"unlocked":true}'],
    ['config absente', '{"unlocked":true}'],
    ['config nulle et verrouillé', '{"config":null,"unlocked":false}'],
    ['valeur non objet', '42'],
  ])('renvoie null pour %s', async (_name, lock) => {
    expect(await parseRequestContext(await headers(ID, lock))).toBeNull()
  })

  it('renvoie null sans signature, avec une signature fausse ou pour un autre contenu', async () => {
    expect(await parseRequestContext(await headers(ID, encodeLock(LOCKED), null))).toBeNull()
    expect(await parseRequestContext(await headers(ID, encodeLock(LOCKED), 'forged'))).toBeNull()
    const other = await signRequestContext(ID, encodeLock({ config: null, unlocked: true }))
    expect(await parseRequestContext(await headers(ID, encodeLock(LOCKED), other))).toBeNull()
  })

  it('renvoie null quand SYNAPSE_LOCK_SECRET manque à la lecture', async () => {
    const h = await headers(ID, encodeLock(LOCKED))
    vi.stubEnv('SYNAPSE_LOCK_SECRET', '')
    expect(await parseRequestContext(h)).toBeNull()
  })
})
