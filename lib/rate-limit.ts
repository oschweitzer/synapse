/**
 * Limiteur à fenêtre glissante, en mémoire : au plus `limit` appels par clé sur `windowMs`.
 * L'état est propre à chaque instance serveur (pas partagé entre instances serverless) : c'est un garde-fou
 * contre une boucle d'appels, pas un quota strict.
 */
export function createRateLimiter({ limit, windowMs }: { limit: number; windowMs: number }) {
  const hits = new Map<string, number[]>()

  return function allow(key: string): boolean {
    const now = Date.now()
    const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs)
    if (recent.length >= limit) {
      hits.set(key, recent)
      return false
    }
    recent.push(now)
    hits.set(key, recent)
    // Les clés inactives sont retirées au passage pour que la table ne grossisse pas.
    for (const [k, times] of hits) {
      if (times.every((t) => now - t >= windowMs)) hits.delete(k)
    }
    return true
  }
}
