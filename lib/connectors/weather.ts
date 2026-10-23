import { createClient } from '@/lib/supabase/server'
import type { Connector } from './types'

/** Position utilisée tant que `synapse.settings` n'en définit pas. */
export const DEFAULT_LOCATION = { label: 'Paris', latitude: 48.8566, longitude: 2.3522 }

/** Durée du cache Next sur l'appel Open-Meteo (30 min). */
const REVALIDATE_SECONDS = 30 * 60
const HOURS_AHEAD = 6

export type WeatherHour = {
  /** Heure locale du lieu, ex. "14:00". */
  time: string
  temperature: number
  precipitationProbability: number | null
  weatherCode: number
}

export type Weather = {
  location: string
  current: { temperature: number; weatherCode: number }
  today: { min: number; max: number; precipitationProbability: number | null }
  hours: WeatherHour[]
}

type OpenMeteoResponse = {
  utc_offset_seconds: number
  current: { time: string; temperature_2m: number; weather_code: number }
  hourly: {
    time: string[]
    temperature_2m: number[]
    precipitation_probability: (number | null)[]
    weather_code: number[]
  }
  daily: {
    temperature_2m_max: number[]
    temperature_2m_min: number[]
    precipitation_probability_max: (number | null)[]
  }
}

async function readLocation() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .schema('synapse')
    .from('settings')
    .select('weather_label, weather_latitude, weather_longitude')
    .maybeSingle()
  if (error) console.error('[weather] lecture des réglages', error)
  if (data?.weather_latitude == null || data.weather_longitude == null) return DEFAULT_LOCATION
  return {
    label: data.weather_label ?? 'Position enregistrée',
    latitude: data.weather_latitude as number,
    longitude: data.weather_longitude as number,
  }
}

async function fetchForecast(latitude: number, longitude: number): Promise<OpenMeteoResponse> {
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    current: 'temperature_2m,weather_code',
    hourly: 'temperature_2m,precipitation_probability,weather_code',
    daily: 'temperature_2m_max,temperature_2m_min,precipitation_probability_max',
    timezone: 'auto',
    forecast_days: '2',
  })
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, {
    next: { revalidate: REVALIDATE_SECONDS },
    signal: AbortSignal.timeout(5000),
  })
  if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`)
  return res.json()
}

/** Les heures d'Open-Meteo sont locales au lieu ("2026-10-23T14:15"), sans décalage. */
function localToDate(time: string, utcOffsetSeconds: number) {
  return new Date(Date.parse(`${time}Z`) - utcOffsetSeconds * 1000)
}

export function toWeather(location: string, raw: OpenMeteoResponse): Weather {
  const currentHour = raw.current.time.slice(0, 13)
  const start = raw.hourly.time.findIndex((t) => t.slice(0, 13) >= currentHour)
  const hours = (start < 0 ? [] : raw.hourly.time.slice(start + 1, start + 1 + HOURS_AHEAD)).map(
    (time, i) => ({
      time: time.slice(11, 16),
      temperature: raw.hourly.temperature_2m[start + 1 + i],
      precipitationProbability: raw.hourly.precipitation_probability[start + 1 + i],
      weatherCode: raw.hourly.weather_code[start + 1 + i],
    }),
  )

  return {
    location,
    current: { temperature: raw.current.temperature_2m, weatherCode: raw.current.weather_code },
    today: {
      min: raw.daily.temperature_2m_min[0],
      max: raw.daily.temperature_2m_max[0],
      precipitationProbability: raw.daily.precipitation_probability_max[0],
    },
    hours,
  }
}

export const weatherConnector: Connector<Weather | null> = {
  id: 'weather',
  async read() {
    const location = await readLocation()
    try {
      const raw = await fetchForecast(location.latitude, location.longitude)
      return {
        data: toWeather(location.label, raw),
        syncedAt: localToDate(raw.current.time, raw.utc_offset_seconds),
      }
    } catch (e) {
      console.error('[weather] Open-Meteo', e)
      return {
        data: null,
        syncedAt: null,
        error: 'Météo indisponible : Open-Meteo ne répond pas. Nouvel essai au prochain chargement.',
      }
    }
  },
}

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
