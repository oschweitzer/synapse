'use client'

import { useEffect } from 'react'

const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'scroll', 'touchstart'] as const

/**
 * Verrouille l'écran après `idleMinutes` d'inactivité, ou au retour d'un passage en arrière-plan
 * plus long que ce délai. Le serveur applique la même expiration : ceci n'est que le côté visible.
 * `idleMinutes` = 0 : jusqu'à la fermeture du navigateur, rien à surveiller.
 */
export function AutoLock({ idleMinutes }: { idleMinutes: number }) {
  useEffect(() => {
    if (idleMinutes <= 0) return
    const delay = idleMinutes * 60_000
    let last = Date.now()

    const lock = async () => {
      await fetch('/api/lock/lock', { method: 'POST', redirect: 'manual' }).catch(() => {})
      window.location.assign('/unlock')
    }
    const check = () => {
      if (Date.now() - last >= delay) void lock()
    }
    const touch = () => {
      last = Date.now()
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') check()
    }

    ACTIVITY_EVENTS.forEach((name) => window.addEventListener(name, touch, { passive: true }))
    document.addEventListener('visibilitychange', onVisibility)
    const timer = window.setInterval(check, 10_000)
    return () => {
      ACTIVITY_EVENTS.forEach((name) => window.removeEventListener(name, touch))
      document.removeEventListener('visibilitychange', onVisibility)
      window.clearInterval(timer)
    }
  }, [idleMinutes])

  return null
}
