import { NextResponse } from 'next/server'
import { CashError } from '@/lib/connectors/cash'

/**
 * Réponse JSON commune des route handlers /api/cash. Une écriture exige un corps
 * `application/json` : un formulaire d'un autre site ne peut pas en envoyer sans
 * requête de contrôle CORS, qui échouerait.
 */
export async function respond(request: Request, fn: (body: unknown) => Promise<unknown>) {
  let body: unknown = null
  if (request.method !== 'GET' && request.method !== 'DELETE') {
    if (!request.headers.get('content-type')?.startsWith('application/json')) {
      return NextResponse.json({ error: 'Corps JSON attendu.' }, { status: 415 })
    }
    body = await request.json().catch(() => null)
  }

  try {
    return NextResponse.json((await fn(body)) ?? { ok: true })
  } catch (e) {
    if (e instanceof CashError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.status })
    console.error('[api/cash]', e)
    return NextResponse.json({ error: 'Google Sheets ne répond pas, réessaie.' }, { status: 502 })
  }
}

/** Champ d'un corps JSON. */
export function field(body: unknown, name: string) {
  return body && typeof body === 'object' ? (body as Record<string, unknown>)[name] : undefined
}
