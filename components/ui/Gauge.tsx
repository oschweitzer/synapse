import type { ReactNode } from 'react'
import { cx } from './cx'

/** Anneau segmenté de 270° pour une valeur de 0 à `max`. */
export function Gauge({
  value,
  max = 100,
  display,
  label,
  tone = 'cyan',
  size = 120,
  thickness = 8,
  className,
}: {
  value: number
  max?: number
  display?: ReactNode
  label?: string
  tone?: 'cyan' | 'amber' | 'ok'
  size?: number
  thickness?: number
  className?: string
}) {
  const r = (size - thickness) / 2 - 6
  const c = size / 2
  const circ = 2 * Math.PI * r
  const len = circ * 0.75
  const pct = Math.max(0, Math.min(1, value / max))
  const common = { cx: c, cy: c, r, strokeWidth: thickness, transform: `rotate(135 ${c} ${c})`, strokeDasharray: `${len} ${circ}` }

  return (
    <div
      className={cx('hud-gauge', tone !== 'cyan' && `hud-gauge--${tone}`, className)}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-label={label}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle className="hud-gauge__track" {...common} />
        <circle className="hud-gauge__arc" {...common} strokeDashoffset={len * (1 - pct)} />
        {Array.from({ length: 25 }, (_, i) => {
          const a = ((135 + (270 * i) / 24) * Math.PI) / 180
          const r1 = r + thickness / 2 + 3
          const r2 = r1 + (i % 6 === 0 ? 5 : 2.5)
          return <line key={i} className="hud-gauge__tick" x1={c + r1 * Math.cos(a)} y1={c + r1 * Math.sin(a)} x2={c + r2 * Math.cos(a)} y2={c + r2 * Math.sin(a)} />
        })}
      </svg>
      <div className="hud-gauge__center">
        <span className="hud-gauge__value">{display ?? value}</span>
        {label && <span className="hud-gauge__label">{label}</span>}
      </div>
    </div>
  )
}
