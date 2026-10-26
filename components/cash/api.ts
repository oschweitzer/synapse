/** Appel d'un route handler /api/cash depuis le navigateur. */
export async function cashApi<T = unknown>(
  path: string,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  body?: unknown,
): Promise<{ ok: true; data: T } | { ok: false; error: string; gone: boolean }> {
  try {
    const res = await fetch(`/api/cash${path}`, {
      method,
      headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    // Session expirée : le middleware redirige vers /login, qui répond en HTML.
    if (res.redirected) return { ok: false, error: 'Session expirée, recharge la page.', gone: false }
    const json = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, error: json.error ?? 'Erreur inattendue, réessaie.', gone: json.code === 'gone' }
    return { ok: true, data: json as T }
  } catch {
    return { ok: false, error: 'Réseau indisponible, réessaie.', gone: false }
  }
}
