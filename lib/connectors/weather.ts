import { envUrl } from '@/lib/env'
import { createClient } from '@/lib/supabase/server'
import type { Connector } from './types'
import type { CityWeather, Weather, WeatherHour } from '@/lib/weather'

export { describeWeatherCode } from '@/lib/weather'
export type { CityWeather, Weather, WeatherHour }

/** Ville utilisée tant qu'aucune n'est configurée. */
export const DEFAULT_LOCATION = { id: 'default', label: 'Paris', latitude: 48.8566, longitude: 2.3522 }

/** Nombre maximal de villes dans le widget. */
export const WEATHER_LOCATIONS_MAX = 5

/** Durée du cache Next sur l'appel Open-Meteo (30 min). */
const REVALIDATE_SECONDS = 30 * 60
const HOURS_AHEAD = 6

const DEFAULT_FORECAST_URL = 'https://api.open-meteo.com/v1/forecast'
const DEFAULT_GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search'

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

export type WeatherLocation = { id: string; label: string; latitude: number; longitude: number }

/** Villes configurées, dans l'ordre ; Paris par défaut si aucune. */
export async function listLocations(): Promise<WeatherLocation[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .schema('synapse')
    .from('weather_locations')
    .select('id, label, latitude, longitude')
    .order('position')
    .order('created_at')
  if (error) throw error
  return data.length ? data : [DEFAULT_LOCATION]
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
  const res = await fetch(`${envUrl('OPEN_METEO_FORECAST_URL', DEFAULT_FORECAST_URL)}?${params}`, {
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

export const weatherConnector: Connector<CityWeather[]> = {
  id: 'weather',
  async read() {
    let locations: WeatherLocation[]
    try {
      locations = await listLocations()
    } catch (e) {
      console.error('[weather] lecture des villes', e)
      locations = [DEFAULT_LOCATION]
    }

    // Une ville en échec n'empêche pas les autres de s'afficher.
    const results = await Promise.all(
      locations.map(async (location) => {
        try {
          const raw = await fetchForecast(location.latitude, location.longitude)
          return {
            city: { id: location.id, label: location.label, weather: toWeather(location.label, raw) },
            syncedAt: localToDate(raw.current.time, raw.utc_offset_seconds),
          }
        } catch (e) {
          console.error('[weather] Open-Meteo', location.label, e)
          return { city: { id: location.id, label: location.label, weather: null }, syncedAt: null }
        }
      }),
    )

    const cities = results.map((r) => r.city)
    const syncedAt = results.find((r) => r.syncedAt)?.syncedAt ?? null
    if (!syncedAt) {
      return {
        data: cities,
        syncedAt: null,
        error: 'Météo indisponible : Open-Meteo ne répond pas. Nouvel essai au prochain chargement.',
      }
    }
    return { data: cities, syncedAt }
  },
}

export type CityResult = { label: string; detail: string; latitude: number; longitude: number }

type GeocodingResponse = {
  results?: { name: string; admin1?: string; country?: string; latitude: number; longitude: number }[]
}

/** Recherche de villes par nom (géocodage Open-Meteo, gratuit, sans clé). */
export async function searchCities(query: string): Promise<CityResult[]> {
  const params = new URLSearchParams({ name: query, count: '5', language: 'fr', format: 'json' })
  const res = await fetch(`${envUrl('OPEN_METEO_GEOCODING_URL', DEFAULT_GEOCODING_URL)}?${params}`, {
    signal: AbortSignal.timeout(5000),
  })
  if (!res.ok) throw new Error(`Open-Meteo geocoding HTTP ${res.status}`)
  const body: GeocodingResponse = await res.json()
  return (body.results ?? []).map((r) => ({
    label: r.name.slice(0, 80),
    detail: [r.admin1, r.country].filter(Boolean).join(', '),
    latitude: r.latitude,
    longitude: r.longitude,
  }))
}
