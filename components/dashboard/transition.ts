/** Sens de l'animation d'entrée d'un dashboard : `next` (onglet suivant), `previous` (onglet précédent), `none` (pas d'animation). */
export type TransitionDirection = 'next' | 'previous' | 'none'

/**
 * Sens de la transition d'un dashboard à l'autre. Un index est la position du dashboard dans la navigation
 * « Dashboards » ; au premier rendu il n'y a pas d'index précédent (`null`), donc pas d'animation.
 */
export function transitionDirection(previousIndex: number | null, nextIndex: number): TransitionDirection {
  if (previousIndex === null || previousIndex === nextIndex) return 'none'
  return nextIndex > previousIndex ? 'next' : 'previous'
}
