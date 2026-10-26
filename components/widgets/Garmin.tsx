import type { Activities, Sleep, Trend } from '@/lib/connectors/garmin'
import { TIME_ZONE } from '@/lib/time'

const muted = 'text-slate-500 dark:text-slate-400'
const number = new Intl.NumberFormat('fr-FR')

function Empty() {
  return (
    <p className={`text-sm ${muted}`}>
      Pas encore de données Garmin. La synchro passe toutes les 3 h (mise en place : voir le README).
    </p>
  )
}

function formatDuration(seconds: number) {
  const minutes = Math.round(seconds / 60)
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} min`
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')}`
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('fr-FR', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit' })
}

/** Jour AAAA-MM-JJ (stocké tel quel), lu en UTC pour ne pas changer de date. */
function formatDay(iso: string, options: Intl.DateTimeFormatOptions) {
  return new Date(iso).toLocaleDateString('fr-FR', { timeZone: 'UTC', ...options })
}

// Sommeil et Body Battery ------------------------------------------------------

export function SleepWidget({ sleep }: { sleep: Sleep }) {
  if (sleep.status === 'empty') return <Empty />
  const { night } = sleep
  const stages = [
    ['Profond', night.deepSeconds],
    ['Léger', night.lightSeconds],
    ['Paradoxal', night.remSeconds],
    ['Éveil', night.awakeSeconds],
  ] as const

  return (
    <div className="flex flex-col gap-3">
      {!night.isToday && (
        <p className={`text-xs ${muted}`}>
          Nuit jusqu’au {formatDay(`${night.day}T12:00:00Z`, { weekday: 'long', day: 'numeric', month: 'short' })}
        </p>
      )}
      <div className="flex items-baseline gap-3">
        <p className="text-3xl font-semibold tabular-nums">{formatDuration(night.sleepSeconds)}</p>
        {night.score != null && <p className={`text-sm ${muted}`}>Score {night.score}</p>}
      </div>
      {night.sleepStartAt && night.sleepEndAt && (
        <p className={`text-sm ${muted}`}>
          {formatTime(night.sleepStartAt)} → {formatTime(night.sleepEndAt)}
        </p>
      )}
      <dl className="grid grid-cols-4 gap-1 text-xs">
        {stages.map(([label, seconds]) => (
          <div key={label} className="flex flex-col">
            <dt className={muted}>{label}</dt>
            <dd className="tabular-nums">{seconds != null ? formatDuration(seconds) : '–'}</dd>
          </div>
        ))}
      </dl>
      {(night.bodyBatteryAtWake != null || night.bodyBatteryCharged != null) && (
        <div className="flex flex-col gap-1">
          <p className="text-sm">
            Body Battery
            {night.bodyBatteryAtWake != null && <> · {night.bodyBatteryAtWake} au réveil</>}
            {night.bodyBatteryCharged != null && (
              <span className={muted}>
                {' '}
                ({night.bodyBatteryCharged >= 0 ? '+' : ''}
                {night.bodyBatteryCharged} cette nuit)
              </span>
            )}
          </p>
          {night.bodyBatteryAtWake != null && (
            <div
              role="meter"
              aria-label="Body Battery au réveil"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={night.bodyBatteryAtWake}
              className="h-2 overflow-hidden bg-line-500"
            >
              <div
                className="h-full bg-cyan-400"
                style={{ width: `${Math.min(100, Math.max(0, night.bodyBatteryAtWake))}%` }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Dernières activités -------------------------------------------------------------

function formatStart(iso: string, now = new Date()) {
  const date = new Date(iso)
  const day = (d: Date) => d.toLocaleDateString('fr-FR', { timeZone: TIME_ZONE })
  const yesterday = new Date(now.getTime() - 86_400_000)
  const prefix =
    day(date) === day(now)
      ? 'Aujourd’hui'
      : day(date) === day(yesterday)
        ? 'Hier'
        : date.toLocaleDateString('fr-FR', { timeZone: TIME_ZONE, weekday: 'short', day: 'numeric', month: 'short' })
  return `${prefix}, ${formatTime(iso)}`
}

function formatDistance(meters: number) {
  return meters >= 1000
    ? `${(meters / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} km`
    : `${Math.round(meters)} m`
}

export function ActivitiesWidget({ activities }: { activities: Activities }) {
  if (activities.status === 'empty') return <Empty />

  return (
    <ul className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800" aria-label="Dernières activités">
      {activities.activities.map((a) => {
        const stats = [
          a.distanceMeters ? formatDistance(a.distanceMeters) : null,
          a.durationSeconds ? formatDuration(a.durationSeconds) : null,
          a.elevationGainMeters ? `D+ ${Math.round(a.elevationGainMeters)} m` : null,
          a.avgHr ? `${a.avgHr} bpm` : null,
        ].filter(Boolean)
        return (
          <li key={a.id} className="py-2 text-sm first:pt-0 last:pb-0">
            <a
              href={`https://connect.garmin.com/modern/activity/${a.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium underline-offset-2 hover:underline"
            >
              {a.title}
            </a>
            <span className={`block text-xs ${muted}`}>
              {formatStart(a.startAt)}
              {a.type && a.type !== a.title && <> · {a.type}</>}
            </span>
            {stats.length > 0 && <span className="block tabular-nums">{stats.join(' · ')}</span>}
          </li>
        )
      })}
    </ul>
  )
}

// Tendance sur 7 jours ------------------------------------------------------------

export function TrendWidget({ trend }: { trend: Trend }) {
  if (trend.status === 'empty') return <Empty />

  const scale = Math.max(trend.stepsGoal ?? 0, ...trend.days.map((d) => d.steps ?? 0)) || 1
  const goalPercent = trend.stepsGoal ? (trend.stepsGoal / scale) * 100 : null
  const label = (iso: string) => formatDay(iso, { weekday: 'short', day: 'numeric', month: 'short' })

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm">
        {trend.avgSteps != null && <>{number.format(trend.avgSteps)} pas/jour</>}
        {trend.avgSteps != null && trend.avgRestingHr != null && ' · '}
        {trend.avgRestingHr != null && <>FC repos {trend.avgRestingHr} bpm</>}
        <span className={muted}> en moyenne</span>
      </p>

      <div aria-hidden="true" className="flex flex-col gap-1">
        <p className={`text-xs ${muted}`}>
          Pas{trend.stepsGoal ? ` · objectif ${number.format(trend.stepsGoal)}` : ''}
        </p>
        <div className="relative flex h-24 items-end gap-0.5 border-b border-slate-200 dark:border-slate-700">
          {goalPercent != null && (
            <div
              className="absolute inset-x-0 border-t border-dashed border-slate-300 dark:border-slate-600"
              style={{ bottom: `${goalPercent}%` }}
            />
          )}
          {trend.days.map((d) => (
            <div
              key={d.key}
              title={`${label(d.date)} : ${d.steps != null ? `${number.format(d.steps)} pas` : 'pas de données'}`}
              className="group flex h-full flex-1 items-end"
            >
              {d.steps != null && (
                <div
                  className="w-full bg-cyan-600 group-hover:bg-cyan-400"
                  style={{ height: `${Math.max(1, (d.steps / scale) * 100)}%` }}
                />
              )}
            </div>
          ))}
        </div>
        <div className={`flex gap-0.5 text-center text-xs ${muted}`}>
          {trend.days.map((d) => (
            <span key={d.key} className="flex-1">
              {formatDay(d.date, { weekday: 'narrow' })}
            </span>
          ))}
        </div>
        <p className={`mt-1 text-xs ${muted}`}>FC repos (bpm)</p>
        <div className="flex gap-0.5 text-center text-xs tabular-nums">
          {trend.days.map((d) => (
            <span key={d.key} className="flex-1" title={label(d.date)}>
              {d.restingHr ?? '–'}
            </span>
          ))}
        </div>
      </div>

      <table className="sr-only">
        <caption>Pas et fréquence cardiaque au repos, 7 derniers jours</caption>
        <thead>
          <tr>
            <th scope="col">Jour</th>
            <th scope="col">Pas</th>
            <th scope="col">FC repos (bpm)</th>
          </tr>
        </thead>
        <tbody>
          {trend.days.map((d) => (
            <tr key={d.key}>
              <th scope="row">{label(d.date)}</th>
              <td>{d.steps != null ? number.format(d.steps) : '–'}</td>
              <td>{d.restingHr ?? '–'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
