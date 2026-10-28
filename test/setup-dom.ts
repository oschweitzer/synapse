import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'

/**
 * Setup global : enregistre les matchers jest-dom (`toBeInTheDocument`, `toHaveClass`...) sur `expect`
 * et démonte les composants rendus entre deux tests. Le nettoyage automatique de Testing Library ne
 * se déclenche pas car les globales de Vitest sont désactivées.
 */
afterEach(async () => {
  // Tests `lib/` en environnement node : pas de DOM, rien à nettoyer.
  if (typeof document === 'undefined') return
  const { cleanup } = await import('@testing-library/react')
  cleanup()
})
