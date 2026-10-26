import type { ReactNode } from 'react'
import { cx } from './cx'
import { Icon } from './Icon'

/** Mesure étiquetée. `trend` dit le sens (up = bon, down = mauvais, warn = ambre), pas la direction. */
export function Stat({
  label,
  value,
  unit,
  delta,
  trend = 'flat',
  size = 'md',
  className,
}: {
  label: string
  value: ReactNode
  unit?: string
  delta?: string
  trend?: 'up' | 'down' | 'warn' | 'flat'
  size?: 'md' | 'xl'
  className?: string
}) {
  return (
    <div className={cx('hud-stat', size === 'xl' && 'hud-stat--xl', className)}>
      <span className="hud-label">{label}</span>
      <span className="hud-stat__value">
        {value}
        {unit && <span className="hud-stat__unit">{unit}</span>}
      </span>
      {delta && (
        <span className={cx('hud-stat__delta', trend !== 'flat' && `hud-stat__delta--${trend}`)}>
          {trend === 'up' && <Icon name="up" size={12} />}
          {trend === 'down' && <Icon name="down" size={12} />}
          {delta}
        </span>
      )}
    </div>
  )
}
