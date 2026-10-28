/**
 * URL d'une API externe, surchargeable par variable d'environnement pour les tests e2e uniquement
 * (serveur factice). Variable absente ou vide : `fallback`, c'est-à-dire la vraie API.
 * Lue à chaque appel, jamais mise en cache au chargement du module.
 */
export function envUrl(name: string, fallback: string): string {
  return process.env[name] || fallback
}
