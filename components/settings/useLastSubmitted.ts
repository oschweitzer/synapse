'use client'

import { useState } from 'react'

/**
 * Un seul message pour une section à plusieurs formulaires : celui du dernier formulaire envoyé, suivi côté client par
 * `setLast` (appelé dans `onSubmit`, `null` : on ne sait pas lequel ; l'`at` d'un état vient de l'horloge du serveur, il ne sert pas à ordonner deux
 * envois). Sans JavaScript `onSubmit` ne tourne pas (`last` reste null) : seul l'état revenu du POST natif est rempli,
 * on renvoie le premier qui l'est, dans l'ordre de `states`.
 */
export function useLastSubmitted<T extends Record<string, unknown>>(states: T): [T[keyof T], (key: (keyof T & string) | null) => void] {
  const [last, setLast] = useState<(keyof T & string) | null>(null)
  const latest = last ? states[last] : (Object.values(states).find((s) => s !== null) ?? null)
  return [latest as T[keyof T], setLast]
}
