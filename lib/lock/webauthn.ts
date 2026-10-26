import { headers } from 'next/headers'

export const RP_NAME = 'Synapse'

/** Identifiant et origine WebAuthn de la requête (derrière le proxy Vercel : en-têtes forwarded). */
export async function relyingParty(): Promise<{ rpID: string; origin: string }> {
  const h = await headers()
  const host = (h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost').split(',')[0].trim()
  const rpID = host.replace(/:\d+$/, '')
  const local = rpID === 'localhost' || rpID === '127.0.0.1'
  const proto = (h.get('x-forwarded-proto') ?? (local ? 'http' : 'https')).split(',')[0].trim()
  return { rpID, origin: `${proto}://${host}` }
}

export const toBase64Url = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64url')
export const fromBase64Url = (value: string) => new Uint8Array(Buffer.from(value, 'base64url'))
