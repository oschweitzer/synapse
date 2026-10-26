import type { ReactNode } from 'react'
import { cx } from './cx'

export type Tone = 'cyan' | 'amber' | 'ok' | 'danger' | 'neutral'

export function Badge({ tone = 'neutral', dot, className, children }: { tone?: Tone; dot?: boolean; className?: string; children?: ReactNode }) {
  return (
    <span className={cx('hud-badge', `hud-badge--${tone}`, className)}>
      {dot && <span className="hud-dot" />}
      {children}
    </span>
  )
}
