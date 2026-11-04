/**
 * Appels à l'API Gmail v1, côté serveur, avec un jeton d'accès frais
 * (`refreshAccessToken`). Une seule opération : retirer le libellé UNREAD d'un
 * message (scope `gmail.modify`). Aucune lecture de corps, aucun envoi.
 */

import { envUrl } from '@/lib/env'

const DEFAULT_API = 'https://gmail.googleapis.com/gmail/v1/users/me'

/** Réponse d'erreur de Google : 401 jeton refusé, 403 scope absent ou quota (voir `reason`), 404 message introuvable. */
export class GmailError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** Raison fournie par Google (`insufficientPermissions`, `rateLimitExceeded`, …). */
    readonly reason?: string,
  ) {
    super(message)
  }
}

/** Marque un message comme lu en retirant son libellé UNREAD. */
export async function markMessageRead(token: string, messageId: string): Promise<void> {
  const res = await fetch(`${envUrl('GOOGLE_GMAIL_API_URL', DEFAULT_API)}/messages/${encodeURIComponent(messageId)}/modify`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ removeLabelIds: ['UNREAD'] }),
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    const reason: unknown = body.error?.errors?.[0]?.reason ?? body.error?.details?.find((d: { reason?: unknown }) => d?.reason)?.reason
    throw new GmailError(
      res.status,
      `Gmail ${res.status} : ${body.error?.message ?? res.statusText}`,
      typeof reason === 'string' ? reason : undefined,
    )
  }
}
