/** Types et libellés météo, sans dépendance serveur : utilisables par les composants client. */

export type WeatherHour = {
  /** Heure locale du lieu, ex. "14:00". */
  time: string
  temperature: number
  precipitationProbability: number | null
  weatherCode: number
}

export type WeatherDay = {
  /** Date locale du lieu, ex. "2026-01-15". */
  date: string
  min: number
  max: number
  precipitationProbability: number | null
  weatherCode: number
}

export type Weather = {
  location: string
  current: { temperature: number; weatherCode: number }
  today: { min: number; max: number; precipitationProbability: number | null }
  hours: WeatherHour[]
  days: WeatherDay[]
}

/** Libellé d'un jour de la vue semaine ; UTC à midi pour que serveur et navigateur rendent la même chaîne. */
export function dayLabel(date: string, index: number): string {
  if (index === 0) return 'Auj.'
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

/** Une ville du widget ; `weather` vaut null si Open-Meteo n'a pas répondu pour elle. */
export type CityWeather = { id: string; label: string; weather: Weather | null }

/** Codes météo WMO renvoyés par Open-Meteo. */
export function describeWeatherCode(code: number): { label: string; icon: string } {
  if (code === 0) return { label: 'Ciel dégagé', icon: '☀️' }
  if (code <= 2) return { label: 'Peu nuageux', icon: '🌤️' }
  if (code === 3) return { label: 'Couvert', icon: '☁️' }
  if (code === 45 || code === 48) return { label: 'Brouillard', icon: '🌫️' }
  if (code >= 51 && code <= 57) return { label: 'Bruine', icon: '🌦️' }
  if (code >= 61 && code <= 67) return { label: 'Pluie', icon: '🌧️' }
  if (code >= 71 && code <= 77) return { label: 'Neige', icon: '🌨️' }
  if (code >= 80 && code <= 82) return { label: 'Averses', icon: '🌦️' }
  if (code === 85 || code === 86) return { label: 'Averses de neige', icon: '🌨️' }
  if (code >= 95) return { label: 'Orage', icon: '⛈️' }
  return { label: 'Inconnu', icon: '🌡️' }
}
