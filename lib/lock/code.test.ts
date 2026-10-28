import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CODE_MAX, CODE_MIN, checkCode, hashCode, validateNewCode } from '@/lib/lock/code'

// scrypt (N = 2^15) est lent : peu d'appels, et un délai large sur les tests asynchrones.
const SLOW = 20_000

beforeEach(() => {
  vi.stubEnv('SYNAPSE_LOCK_SECRET', 'x'.repeat(32))
})

describe('validateNewCode', () => {
  it('refuse un code trop court', () => {
    expect(validateNewCode('a'.repeat(CODE_MIN - 1))).toContain(String(CODE_MIN))
  })

  it('accepte les longueurs limites', () => {
    expect(validateNewCode('a'.repeat(CODE_MIN))).toBeNull()
    expect(validateNewCode('a'.repeat(CODE_MAX))).toBeNull()
  })

  it('refuse un code trop long', () => {
    expect(validateNewCode('a'.repeat(CODE_MAX + 1))).toContain(String(CODE_MAX))
  })
})

describe('hashCode / checkCode', () => {
  it(
    'produit un hash de 32 octets et un sel de 16 octets, différents à chaque appel',
    async () => {
      const [a, b] = await Promise.all([hashCode('secret-code'), hashCode('secret-code')])
      expect(Buffer.from(a.hash, 'base64')).toHaveLength(32)
      expect(Buffer.from(a.salt, 'base64')).toHaveLength(16)
      expect(a.salt).not.toBe(b.salt)
      expect(a.hash).not.toBe(b.hash)
    },
    SLOW,
  )

  it(
    'accepte le bon code et refuse un mauvais',
    async () => {
      const { hash, salt } = await hashCode('secret-code')
      expect(await checkCode('secret-code', hash, salt)).toBe(true)
      expect(await checkCode('autre-code', hash, salt)).toBe(false)
    },
    SLOW,
  )

  it(
    'normalise en NFKC : la ligature « ﬁ » vaut « fi »',
    async () => {
      const { hash, salt } = await hashCode('code-ﬁn')
      expect(await checkCode('code-fin', hash, salt)).toBe(true)
    },
    SLOW,
  )

  it(
    'refuse un hash de longueur différente',
    async () => {
      const { hash, salt } = await hashCode('secret-code')
      const truncated = Buffer.from(hash, 'base64').subarray(0, 16).toString('base64')
      expect(await checkCode('secret-code', truncated, salt)).toBe(false)
    },
    SLOW,
  )

  it('refuse de hacher sans secret serveur', async () => {
    vi.stubEnv('SYNAPSE_LOCK_SECRET', '')
    await expect(hashCode('secret-code')).rejects.toThrow('SYNAPSE_LOCK_SECRET')
  })

  it('refuse de hacher avec un secret de moins de 32 caractères', async () => {
    vi.stubEnv('SYNAPSE_LOCK_SECRET', 'x'.repeat(31))
    await expect(hashCode('secret-code')).rejects.toThrow('SYNAPSE_LOCK_SECRET')
  })
})
