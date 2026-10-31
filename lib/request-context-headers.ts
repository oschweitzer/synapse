// En-têtes internes posés par le middleware pour la page. Pur et sans next/headers : utilisable côté Edge.
import type { LockState } from '@/lib/lock/config'
import { signContext, verifyContext } from '@/lib/lock/token'

export const FORWARDED_HEADER_PREFIX = 'x-synapse-'
export const USER_ID_HEADER = 'x-synapse-user-id'
export const LOCK_HEADER = 'x-synapse-lock'
export const SIGNATURE_HEADER = 'x-synapse-sig'

export type RequestContext = { userId: string; lock: LockState }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Supprime tout en-tête `x-synapse-*` entrant : un client ne doit pas pouvoir les fournir. */
export function stripForwardedHeaders(headers: Headers): void {
  const names: string[] = []
  headers.forEach((_value, name) => {
    if (name.toLowerCase().startsWith(FORWARDED_HEADER_PREFIX)) names.push(name)
  })
  names.forEach((name) => headers.delete(name))
}

export function encodeLock(lock: LockState): string {
  return JSON.stringify({
    config: lock.config ? { idleMinutes: lock.config.idleMinutes, epoch: lock.config.epoch } : null,
    unlocked: lock.unlocked,
  })
}

/** Signature HMAC de l'identifiant et du verrouillage : sans elle, la page ignore les en-têtes. */
export async function signRequestContext(userId: string, encodedLock: string): Promise<string> {
  return signContext(`${userId}|${encodedLock}`)
}

function isCount(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0
}

/** `null` si un en-tête manque, est mal formé ou mal signé : jamais de contexte partiel. */
export async function parseRequestContext(headers: Pick<Headers, 'get'>): Promise<RequestContext | null> {
  const userId = headers.get(USER_ID_HEADER)
  const raw = headers.get(LOCK_HEADER)
  const signature = headers.get(SIGNATURE_HEADER)
  if (!userId || !raw || !signature || !UUID.test(userId)) return null
  try {
    if (!(await verifyContext(`${userId}|${raw}`, signature))) return null
  } catch {
    return null // secret manquant : on ne fait confiance à rien
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) return null
  const { config, unlocked } = parsed as { config?: unknown; unlocked?: unknown }
  if (typeof unlocked !== 'boolean') return null
  if (config === null) return unlocked ? { userId, lock: { config: null, unlocked } } : null
  if (typeof config !== 'object') return null
  const { idleMinutes, epoch } = config as { idleMinutes?: unknown; epoch?: unknown }
  if (!isCount(idleMinutes) || !isCount(epoch)) return null
  return { userId, lock: { config: { idleMinutes, epoch }, unlocked } }
}
