import { cx } from './cx'
import { Spinner } from './Spinner'

/**
 * Écran de chargement d'une route (`loading.tsx`) : spinner HUD et libellé.
 * Le cadre reprend celui de la page remplacée, pour que le contenu n'ait pas à bouger en arrivant.
 * - `page` : colonne centrée des pages cash, recettes, cartes et réglages
 * - `screen` : écran étroit centré verticalement (déverrouillage)
 * - `full` : plein écran (tableau de bord, éditeur de carte mentale)
 */
export function PageLoading({
  layout = 'page',
  label = 'Chargement…',
}: {
  layout?: 'page' | 'screen' | 'full'
  label?: string
}) {
  // Le spinner porte le rôle `status` et le nom accessible ; le texte visible est masqué aux lecteurs d'écran pour ne pas être lu deux fois.
  const content = (
    <>
      <Spinner size="lg" label={label} />
      <p className="hud-page-loading__text" aria-hidden="true">
        {label}
      </p>
    </>
  )

  if (layout === 'full') {
    return <main className="hud-page-loading min-h-screen">{content}</main>
  }

  return (
    <main
      className={
        layout === 'screen'
          ? 'mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-4'
          : 'mx-auto max-w-xl px-4 py-6'
      }
    >
      <div className={cx('hud-page-loading', layout === 'page' && 'min-h-[60vh]')}>{content}</div>
    </main>
  )
}
