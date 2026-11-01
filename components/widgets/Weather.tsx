'use client'

import { useState } from 'react'
import { dayLabel, describeWeatherCode, type CityWeather, type Weather } from '@/lib/weather'

type View = 'day' | 'week'

const round = (n: number) => `${Math.round(n)}°`

function City({
  weather,
  view,
  onViewChange,
}: {
  weather: Weather
  view: View
  onViewChange: (view: View) => void
}) {
  const now = describeWeatherCode(weather.current.weatherCode)
  const rain = weather.today.precipitationProbability

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span className="text-4xl" aria-hidden="true">
          {now.icon}
        </span>
        <div>
          <p className="text-3xl font-semibold">{round(weather.current.temperature)}</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {now.label} · {weather.location}
          </p>
        </div>
      </div>
      <p className="text-sm">
        Min {round(weather.today.min)} · Max {round(weather.today.max)}
        {rain != null && <> · Pluie {rain} %</>}
      </p>
      <div role="group" aria-label="Vue de la prévision" className="flex gap-1">
        {(
          [
            ['day', 'Jour'],
            ['week', 'Semaine'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={view === value}
            onClick={() => onViewChange(value)}
            className={`hud-btn hud-btn--sm ${view === value ? 'hud-btn--primary' : 'hud-btn--ghost'}`}
          >
            {label}
          </button>
        ))}
      </div>
      {view === 'day' && weather.hours.length === 0 && (
        <p className="text-sm text-slate-500 dark:text-slate-400">Prévision horaire indisponible.</p>
      )}
      {view === 'day' && weather.hours.length > 0 && (
        <ul
          role="list"
          tabIndex={0}
          aria-label="Prévision heure par heure, 24 prochaines heures"
          className="flex snap-x snap-mandatory gap-2 overflow-x-auto pb-1 text-center text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500"
        >
          {weather.hours.map((h, i) => {
            const d = describeWeatherCode(h.weatherCode)
            // Minuit : début du lendemain, marqué par un séparateur.
            const nextDay = i > 0 && h.time === '00:00'
            return (
              <li
                key={`${i}-${h.time}`}
                className={`flex w-12 shrink-0 snap-start flex-col gap-0.5 ${nextDay ? 'border-l border-slate-300 dark:border-slate-600' : ''}`}
              >
                <span className="text-slate-500 dark:text-slate-400">
                  {nextDay && <span className="sr-only">demain, </span>}
                  {h.time}
                </span>
                <span role="img" aria-label={d.label}>
                  {d.icon}
                </span>
                <span>{round(h.temperature)}</span>
                {h.precipitationProbability != null && (
                  <span className="text-sky-700 dark:text-sky-400">{h.precipitationProbability} %</span>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {view === 'week' &&
        (weather.days.length > 0 ? (
          <ul aria-label="Prévision sur 7 jours" className="flex flex-col gap-1 text-sm">
            {weather.days.map((d, i) => (
              <li key={d.date} className="flex items-center gap-2">
                <span className="w-16 text-slate-500 dark:text-slate-400">{dayLabel(d.date, i)}</span>
                <span role="img" aria-label={describeWeatherCode(d.weatherCode).label}>
                  {describeWeatherCode(d.weatherCode).icon}
                </span>
                <span>
                  Min {round(d.min)} · Max {round(d.max)}
                </span>
                {d.precipitationProbability != null && (
                  <span className="text-sky-700 dark:text-sky-400">{d.precipitationProbability} %</span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500 dark:text-slate-400">Prévision de la semaine indisponible.</p>
        ))}
    </div>
  )
}

export function WeatherWidget({ cities }: { cities: CityWeather[] }) {
  const [selected, setSelected] = useState(cities[0]?.id)
  const [views, setViews] = useState<Record<string, View>>({})
  const city = cities.find((c) => c.id === selected) ?? cities[0]
  if (!city) return null

  return (
    <div className="flex flex-col gap-3">
      {cities.length > 1 && (
        <div role="group" aria-label="Ville" className="flex flex-wrap gap-1">
          {cities.map((c) => (
            <button
              key={c.id}
              type="button"
              aria-pressed={c.id === city.id}
              onClick={() => setSelected(c.id)}
              className={`hud-btn hud-btn--sm ${c.id === city.id ? 'hud-btn--primary' : 'hud-btn--ghost'}`}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}
      {city.weather ? (
        <City
          weather={city.weather}
          view={views[city.id] ?? 'day'}
          onViewChange={(v) => setViews((prev) => ({ ...prev, [city.id]: v }))}
        />
      ) : (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          Météo de {city.label} indisponible pour le moment.
        </p>
      )}
    </div>
  )
}
