'use client'

import { useState, type ReactNode } from 'react'
import { transitionDirection, type TransitionDirection } from './transition'

/**
 * Anime l'arrivée d'un dashboard (face de cube, voir `.hud-dash-face` dans app/hud.css).
 *
 * Le composant n'a volontairement pas de `key` : il doit survivre à la navigation douce pour se souvenir de
 * l'index précédent. C'est la face qui est clée par `dashboardId` : une nouvelle face est remontée et rejoue
 * l'animation. Un rendu avec le même dashboard et le même index (rafraîchissement RSC, streaming Suspense) garde la direction
 * courante, sans remonter la face ni couper l'animation en cours.
 *
 * L'index et le dashboard précédents sont mémorisés dans un état (« store information from previous renders » de React) et non
 * dans une ref lue au rendu, ce que la règle `react-hooks/refs` interdit.
 */
export function DashboardTransition({
  dashboardId,
  index,
  children,
}: {
  dashboardId: string
  index: number
  children: ReactNode
}) {
  const [state, setState] = useState<{ dashboardId: string; index: number; direction: TransitionDirection }>({
    dashboardId,
    index,
    direction: 'none',
  })
  let direction = state.direction
  if (state.index !== index || state.dashboardId !== dashboardId) {
    // Même index mais autre dashboard (suppression, réordonnancement) : `transitionDirection` rend 'none'.
    direction = transitionDirection(state.index, index)
    setState({ dashboardId, index, direction })
  }

  return (
    <div className="hud-dash-stage">
      <div key={dashboardId} className="hud-dash-face" data-enter={direction}>
        {children}
      </div>
    </div>
  )
}
