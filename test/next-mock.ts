import { expect, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * Aides de test pour le code serveur Next (actions, route handlers). Jamais importé par `app/`.
 */

/**
 * Faux `redirect` : comme le vrai, il interrompt l'exécution en levant une erreur qui porte
 * un `digest`. `app/actions/lock.ts` ne relance que les erreurs qui en ont un : sans lui,
 * `redirect('/login')` serait avalée par son `try/catch` et deviendrait le code `save`.
 */
export class RedirectError extends Error {
  readonly digest: string
  constructor(readonly url: string) {
    super('NEXT_REDIRECT')
    this.digest = `NEXT_REDIRECT;replace;${url};307;`
  }
}

/** À brancher avec `vi.mocked(redirect).mockImplementation(throwRedirect)`. */
export function throwRedirect(url: string): never {
  throw new RedirectError(url)
}

/** Vérifie que l'action redirige vers `url`. */
export async function expectRedirect(promise: Promise<unknown>, url: string) {
  await expect(promise).rejects.toMatchObject({ url })
}

/** `FormData` à partir d'un objet ; un tableau ajoute une entrée par valeur (ex. `widgets`). */
export function form(fields: Record<string, string | string[]>): FormData {
  const data = new FormData()
  for (const [name, value] of Object.entries(fields)) {
    for (const item of Array.isArray(value) ? value : [value]) data.append(name, item)
  }
  return data
}

/** Requête de route handler. `contentType: null` n'envoie aucun en-tête `content-type`. */
export function jsonRequest(
  url: string,
  init: { method?: string; body?: unknown; rawBody?: string; contentType?: string | null; cookie?: string } = {},
): NextRequest {
  const headers = new Headers()
  if (init.contentType !== null) headers.set('content-type', init.contentType ?? 'application/json')
  if (init.cookie) headers.set('cookie', init.cookie)
  const raw = init.rawBody ?? (init.body !== undefined ? JSON.stringify(init.body) : undefined)
  return new NextRequest(new URL(url, 'http://localhost:3000'), { method: init.method ?? 'POST', headers, body: raw })
}

/** Faux magasin de cookies pour `vi.mocked(cookies).mockResolvedValue(jar as never)`. */
export function cookieJar() {
  return { get: vi.fn(), getAll: vi.fn(() => []), set: vi.fn() }
}
