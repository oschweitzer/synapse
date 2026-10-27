import { cx } from './cx'

/** Cercle de chargement HUD : arc cyan sur piste discrète, `currentColor` pour s'adapter au bouton. `lg` sert aux écrans de chargement de page. */
export function Spinner({
  size = 'md',
  label,
  className,
}: {
  size?: 'sm' | 'md' | 'lg'
  /** Libellé pour les lecteurs d'écran ; sans libellé, le spinner est purement décoratif. */
  label?: string
  className?: string
}) {
  return (
    <span
      className={cx('hud-spinner', size === 'sm' && 'hud-spinner--sm', size === 'lg' && 'hud-spinner--lg', className)}
      role={label ? 'status' : undefined}
      aria-hidden={label ? undefined : true}
    >
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle className="hud-spinner__track" cx="12" cy="12" r="9" />
        <circle className="hud-spinner__arc" cx="12" cy="12" r="9" />
      </svg>
      {label && <span className="hud-sr">{label}</span>}
    </span>
  )
}
