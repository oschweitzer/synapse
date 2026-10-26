/**
 * Chiffrement du refresh token Google, côté serveur : chiffré par la route
 * /api/google/callback, déchiffré par les route handlers /api/cash (Sheets).
 *
 * Même format que l'Edge Function synapse-google-sync, qui le déchiffre
 * (`supabase/functions/_shared/chiffrement.ts`, repris de Cairn) : AES-GCM,
 * nonce de 96 bits en tête du chiffré, le tout en hexadécimal. La clé
 * `SYNAPSE_GOOGLE_TOKEN_KEY` (64 caractères hexadécimaux) doit donc être la même
 * sur Vercel et dans les secrets des Edge Functions.
 *
 * Ce chiffrement protège contre une fuite de la base seule, pas contre le
 * serveur : celui-ci doit pouvoir relire le jeton pour appeler Google.
 */

const NONCE_BYTES = 12

function toHex(bytes: Uint8Array) {
  return Buffer.from(bytes).toString('hex')
}

async function loadKey() {
  const raw = process.env.SYNAPSE_GOOGLE_TOKEN_KEY?.trim()
  if (!raw) throw new Error('SYNAPSE_GOOGLE_TOKEN_KEY manquant')
  if (!/^[0-9a-fA-F]{64}$/.test(raw)) {
    throw new Error('SYNAPSE_GOOGLE_TOKEN_KEY doit faire 64 caractères hexadécimaux (256 bits)')
  }
  return crypto.subtle.importKey('raw', Buffer.from(raw, 'hex'), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}

export async function encryptToken(plain: string) {
  const key = await loadKey()
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_BYTES))
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, new TextEncoder().encode(plain))
  return toHex(nonce) + toHex(new Uint8Array(cipher))
}

/** `null` pour un chiffré illisible (clé changée depuis la connexion) : seule une reconnexion répare. */
export async function decryptToken(cipher: string) {
  if (!/^[0-9a-f]+$/i.test(cipher) || cipher.length <= NONCE_BYTES * 2) return null
  const key = await loadKey()
  try {
    const bytes = Buffer.from(cipher, 'hex')
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: bytes.subarray(0, NONCE_BYTES) },
      key,
      bytes.subarray(NONCE_BYTES),
    )
    return new TextDecoder().decode(plain)
  } catch {
    return null
  }
}
