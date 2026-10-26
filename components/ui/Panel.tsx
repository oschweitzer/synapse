import type { CSSProperties, ReactNode } from 'react'
import { cx } from './cx'
import { Icon, type IconName } from './Icon'

/** Cadre de tout widget : coins coupés, équerres cyan, en-tête index · icône · titre · meta. */
export function Panel({
  title,
  index,
  icon,
  meta,
  variant = 'default',
  compact,
  className,
  style,
  busy,
  children,
}: {
  title?: string
  index?: number
  icon?: IconName
  meta?: ReactNode
  /** hero = grand biseau (un seul par écran) · alert = cadre ambre, une action est attendue. */
  variant?: 'default' | 'hero' | 'alert'
  compact?: boolean
  className?: string
  style?: CSSProperties
  busy?: boolean
  children?: ReactNode
}) {
  return (
    <section
      aria-label={title}
      aria-busy={busy || undefined}
      className={cx('hud-panel', variant !== 'default' && `hud-panel--${variant}`, compact && 'hud-panel--compact', className)}
      style={style}
    >
      <div className="hud-panel__inner">
        {(title || meta) && (
          <header className="hud-panel__head">
            {index != null && <span className="hud-panel__index">{String(index).padStart(2, '0')}</span>}
            {icon && (
              <span className="inline-flex text-cyan-400">
                <Icon name={icon} />
              </span>
            )}
            <h2 className="hud-panel__title">{title}</h2>
            <span className="hud-panel__rule" />
            {meta && <div className="hud-panel__meta">{meta}</div>}
          </header>
        )}
        <div className="hud-panel__body">{children}</div>
      </div>
    </section>
  )
}
