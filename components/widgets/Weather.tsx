import { describeWeatherCode, type Weather } from '@/lib/connectors/weather'

const round = (n: number) => `${Math.round(n)}°`

export function WeatherWidget({ weather }: { weather: Weather }) {
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
      {weather.hours.length > 0 && (
        <ul className="grid grid-cols-6 gap-1 text-center text-xs" aria-label="Prochaines heures">
          {weather.hours.map((h) => {
            const d = describeWeatherCode(h.weatherCode)
            return (
              <li key={h.time} className="flex flex-col gap-0.5">
                <span className="text-slate-500 dark:text-slate-400">{h.time}</span>
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
    </div>
  )
}
