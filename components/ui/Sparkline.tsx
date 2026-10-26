import { cx } from './cx'

/** Courbe (avec aire) ou barres, avec ligne d'objectif ambre optionnelle. */
export function Sparkline({
  data,
  type = 'line',
  width = 280,
  height = 64,
  goal,
  labels,
  highlight,
  label = 'tendance',
  className,
}: {
  data: number[]
  type?: 'line' | 'bars'
  width?: number
  height?: number
  goal?: number
  /** Étiquettes d'axe sous les barres, une par point. */
  labels?: string[]
  /** Barre mise en avant (par défaut : la dernière). */
  highlight?: number
  label?: string
  className?: string
}) {
  const pad = 2
  const plotH = height - (labels ? 14 : 0)
  const max = Math.max(...data, goal ?? 0) || 1
  const min = type === 'bars' ? 0 : Math.min(...data)
  const span = max - min || 1
  const x = (i: number) => (type === 'bars' ? (i + 0.5) * (width / data.length) : pad + (i * (width - pad * 2)) / Math.max(1, data.length - 1))
  const y = (v: number) => pad + (plotH - pad * 2) * (1 - (v - min) / span)
  const points = data.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`)
  const barW = (width / data.length) * 0.56
  const hi = highlight ?? data.length - 1

  return (
    <svg className={cx('hud-spark', className)} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" height={height} role="img" aria-label={label}>
      <line className="hud-spark__base" x1={0} x2={width} y1={plotH - 0.5} y2={plotH - 0.5} />
      {type === 'bars' ? (
        data.map((v, i) => (
          <rect key={i} className={cx('hud-spark__bar', i === hi && 'hud-spark__bar--hi')} x={x(i) - barW / 2} y={y(v)} width={barW} height={Math.max(1, plotH - pad - y(v))} />
        ))
      ) : (
        <>
          <polygon className="hud-spark__area" points={`${pad},${plotH} ${points.join(' ')} ${width - pad},${plotH}`} />
          <polyline className="hud-spark__line" points={points.join(' ')} />
          {data.length > 0 && <circle className="hud-spark__dot" cx={x(data.length - 1)} cy={y(data[data.length - 1])} r={2.5} />}
        </>
      )}
      {goal != null && <line className="hud-spark__goal" x1={0} x2={width} y1={y(goal)} y2={y(goal)} />}
      {labels?.map((l, i) => (
        <text key={i} className="hud-spark__axis" x={x(i)} y={height - 2} textAnchor="middle">
          {l}
        </text>
      ))}
    </svg>
  )
}
