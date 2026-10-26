import type { ButtonHTMLAttributes } from 'react'
import { cx } from './cx'
import { Icon, type IconName } from './Icon'

export type ButtonVariant = 'primary' | 'ghost' | 'quiet' | 'danger' | 'danger-quiet'

/** Classes d'un bouton HUD, pour un `<button>`, un `<a>` ou un `<Link>`. */
export function buttonClass({
  variant = 'ghost',
  size = 'md',
  iconOnly,
  block,
}: {
  variant?: ButtonVariant
  size?: 'sm' | 'md'
  iconOnly?: boolean
  block?: boolean
} = {}) {
  return cx('hud-btn', `hud-btn--${variant}`, size === 'sm' && 'hud-btn--sm', iconOnly && 'hud-btn--icon', block && 'hud-btn--block')
}

export function Button({
  variant,
  size,
  icon,
  iconOnly,
  block,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: 'sm' | 'md'
  icon?: IconName
  /** Masque le libellé à l'écran (gardé pour les lecteurs d'écran). */
  iconOnly?: boolean
  block?: boolean
}) {
  return (
    <button type="button" {...rest} className={cx(buttonClass({ variant, size, iconOnly, block }), className)}>
      {icon && <Icon name={icon} />}
      {iconOnly ? <span className="hud-sr">{children}</span> : children}
    </button>
  )
}
