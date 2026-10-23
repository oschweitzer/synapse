/**
 * Encryption of the Google refresh token, on the server.
 *
 * Taken as is from Cairn (supabase/functions/_shared/chiffrement.ts), with its
 * own key: the Supabase project — and so its Edge Functions secrets — is shared
 * with Cairn, and revoking one app must not cut off the other.
 *
 * The key is held by the server (SYNAPSE_GOOGLE_TOKEN_KEY, in the Edge Functions
 * secrets and on Vercel, where /api/google/callback encrypts with the same
 * format: lib/google/crypto.ts). The server has to be able to read — without
 * the plaintext token it cannot call Google. This encryption protects against a
 * leak of the database alone, not against the server itself. A token that reads
 * someone's mailbox, left in plaintext in a table, would make a mislaid backup
 * immediately exploitable; that is precisely what this layer prevents.
 *
 * AES-GCM: native in WebCrypto, so there is no dependency to import in a
 * function that starts cold. Nonce at the head of the ciphertext, all in
 * hexadecimal, because a nonce stored apart is a nonce that can fall out of
 * sync with its ciphertext.
 */

/** 96 bits, the size recommended for AES-GCM and the only one hardware accelerates. */
const NONCE_BYTES = 12

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

// Typed on an ArrayBuffer (not ArrayBufferLike), as WebCrypto expects since TypeScript 5.7.
function fromHex(hex: string): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(new ArrayBuffer(hex.length / 2))
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return out
}

/**
 * Loads the key from the secrets.
 *
 * It is expected as 64 hexadecimal characters, that is 256 bits. The length is
 * checked here rather than left to WebCrypto: its error message does not say
 * which secret is at fault, and a badly copied key is the most likely incident
 * in this whole chain.
 */
async function chargerCle(): Promise<CryptoKey> {
  const brut = Deno.env.get('SYNAPSE_GOOGLE_TOKEN_KEY')
  if (!brut) {
    throw new Error('secret SYNAPSE_GOOGLE_TOKEN_KEY absent des Edge Functions')
  }
  if (!/^[0-9a-fA-F]{64}$/.test(brut.trim())) {
    throw new Error('SYNAPSE_GOOGLE_TOKEN_KEY doit faire 64 caractères hexadécimaux (256 bits)')
  }
  return await crypto.subtle.importKey(
    'raw',
    fromHex(brut.trim()),
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function chiffrer(clair: string): Promise<string> {
  const cle = await chargerCle()
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_BYTES))
  const chiffre = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce },
    cle,
    new TextEncoder().encode(clair),
  )
  return toHex(nonce) + toHex(new Uint8Array(chiffre))
}

/**
 * Returns null rather than throwing, for an unreadable ciphertext.
 *
 * It really happens the day the key is replaced: rows written with the old one
 * become undecryptable. The caller must then ask for a reconnection, which is a
 * normal outcome — not a 500 error that would leave the user facing a failure
 * with no explanation.
 */
export async function dechiffrer(chiffre: string): Promise<string | null> {
  try {
    if (!/^[0-9a-f]+$/i.test(chiffre) || chiffre.length <= NONCE_BYTES * 2) return null
    const cle = await chargerCle()
    const octets = fromHex(chiffre)
    const clair = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: octets.slice(0, NONCE_BYTES) },
      cle,
      octets.slice(NONCE_BYTES),
    )
    return new TextDecoder().decode(clair)
  } catch {
    return null
  }
}
