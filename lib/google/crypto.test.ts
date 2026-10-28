import { describe, it, expect, vi, beforeEach } from 'vitest'
import { decryptToken, encryptToken } from '@/lib/google/crypto'

const KEY = '0123456789abcdef'.repeat(4)

beforeEach(() => {
  vi.stubEnv('SYNAPSE_GOOGLE_TOKEN_KEY', KEY)
})

describe('encryptToken / decryptToken', () => {
  it('chiffre puis déchiffre : on retrouve le texte', async () => {
    const cipher = await encryptToken('refresh-token-é')
    expect(await decryptToken(cipher)).toBe('refresh-token-é')
  })

  it('produit de l’hexadécimal minuscule, nonce de 24 caractères en tête', async () => {
    const cipher = await encryptToken('abc')
    expect(cipher).toMatch(/^[0-9a-f]+$/)
    // 12 octets de nonce + 3 octets de texte + 16 octets d'étiquette GCM, en hexadécimal.
    expect(cipher).toHaveLength((12 + 3 + 16) * 2)
  })

  it('deux chiffrements du même texte diffèrent', async () => {
    expect(await encryptToken('abc')).not.toBe(await encryptToken('abc'))
  })

  it('accepte une clé entourée d’espaces', async () => {
    const cipher = await encryptToken('abc')
    vi.stubEnv('SYNAPSE_GOOGLE_TOKEN_KEY', `  ${KEY}\n`)
    expect(await decryptToken(cipher)).toBe('abc')
  })

  it('renvoie null pour une entrée non hexadécimale ou trop courte', async () => {
    expect(await decryptToken('pas-de-l-hexa')).toBeNull()
    expect(await decryptToken('')).toBeNull()
    expect(await decryptToken('ab'.repeat(12))).toBeNull()
  })

  it('renvoie null pour un chiffré altéré', async () => {
    const cipher = await encryptToken('abc')
    const last = cipher.at(-1) === '0' ? '1' : '0'
    expect(await decryptToken(cipher.slice(0, -1) + last)).toBeNull()
  })

  it('renvoie null avec une autre clé', async () => {
    const cipher = await encryptToken('abc')
    vi.stubEnv('SYNAPSE_GOOGLE_TOKEN_KEY', 'f'.repeat(64))
    expect(await decryptToken(cipher)).toBeNull()
  })

  it('lève quand la clé est absente', async () => {
    vi.stubEnv('SYNAPSE_GOOGLE_TOKEN_KEY', '')
    await expect(encryptToken('abc')).rejects.toThrow('SYNAPSE_GOOGLE_TOKEN_KEY manquant')
  })

  it('lève quand la clé n’a pas 64 caractères hexadécimaux', async () => {
    vi.stubEnv('SYNAPSE_GOOGLE_TOKEN_KEY', 'zz'.repeat(32))
    await expect(encryptToken('abc')).rejects.toThrow('64 caractères hexadécimaux')
    vi.stubEnv('SYNAPSE_GOOGLE_TOKEN_KEY', '0'.repeat(62))
    await expect(decryptToken('ab'.repeat(20))).rejects.toThrow('64 caractères hexadécimaux')
  })
})
