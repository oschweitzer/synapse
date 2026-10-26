import { createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto'

export const CODE_MIN = 6
export const CODE_MAX = 128

export function validateNewCode(code: string): string | null {
  if (code.length < CODE_MIN) return `Le code doit faire ${CODE_MIN} caractères au moins.`
  if (code.length > CODE_MAX) return `Le code doit faire ${CODE_MAX} caractères au plus.`
  return null
}

function pepper(): Buffer {
  const value = process.env.SYNAPSE_LOCK_SECRET
  if (!value || value.length < 32) throw new Error('SYNAPSE_LOCK_SECRET manquant ou trop court (32 caractères au moins).')
  // Le code est d'abord passé au HMAC avec le secret serveur : le hash stocké est inutilisable
  // hors ligne sans ce secret, même pour qui lirait la table.
  return Buffer.from(value)
}

function derive(code: string, salt: Buffer): Promise<Buffer> {
  const pre = createHmac('sha256', pepper()).update(code.normalize('NFKC')).digest()
  return new Promise((resolve, reject) =>
    scrypt(pre, salt, 32, { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (err, key) =>
      err ? reject(err) : resolve(key),
    ),
  )
}

export async function hashCode(code: string): Promise<{ hash: string; salt: string }> {
  const salt = randomBytes(16)
  return { hash: (await derive(code, salt)).toString('base64'), salt: salt.toString('base64') }
}

export async function checkCode(code: string, hash: string, salt: string): Promise<boolean> {
  const expected = Buffer.from(hash, 'base64')
  const actual = await derive(code, Buffer.from(salt, 'base64'))
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}
