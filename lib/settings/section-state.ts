/**
 * État renvoyé par une action de section des réglages, lu par `useActionState`.
 * `code` désigne le message à afficher ; `at` (`Date.now()`) rend deux résultats identiques distincts,
 * ce qui ré-annonce le message à chaque envoi. `null` : rien n'a encore été envoyé.
 * Importé par des composants client : aucun import serveur ici.
 */
export type SectionState = { code: string; at: number } | null

/** Comme `SectionState`, avec le nom d'habitude envoyé (renvoyé seulement sur les erreurs d'ajout, pour le garder dans le champ). */
export type HabitState = { code: string; at: number; name?: string } | null

/** Comme `SectionState`, avec la checklist envoyée (`noteId`, vide pour « Aucune »), pour garder la sélection du champ. */
export type ShoppingState = { code: string; at: number; noteId: string } | null

/** Construit l'état d'une section pour le code donné. */
export function sectionState(code: string): { code: string; at: number } {
  return { code, at: Date.now() }
}
