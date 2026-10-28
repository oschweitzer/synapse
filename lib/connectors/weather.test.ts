import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createClient } from '@/lib/supabase/server'
import { DEFAULT_LOCATION, listLocations, searchCities, toWeather, weatherConnector } from '@/lib/connectors/weather'
import { mockSupabase, type MockResult } from '@/test/supabase-mock'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))

const fetchMock = vi.fn()

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

const PARIS = { id: 'p', label: 'Paris', latitude: 48.8566, longitude: 2.3522 }
const LAUSANNE = { id: 'l', label: 'Lausanne', latitude: 46.5197, longitude: 6.6323 }

/** Heures locales `2026-01-15T00:00` … ; la température de l'heure H vaut H. */
function hours(count: number, day = '2026-01-15') {
  return Array.from({ length: count }, (_, h) => `${day}T${String(h).padStart(2, '0')}:00`)
}

function forecast(over: Record<string, unknown> = {}) {
  const time = hours(24)
  return {
    utc_offset_seconds: 3600,
    current: { time: '2026-01-15T14:15', temperature_2m: 5.5, weather_code: 3 },
    hourly: {
      time,
      temperature_2m: time.map((_, i) => i),
      precipitation_probability: time.map((_, i) => (i % 2 ? null : i * 2)),
      weather_code: time.map((_, i) => i % 4),
    },
    daily: { temperature_2m_max: [8, 9], temperature_2m_min: [1, 2], precipitation_probability_max: [30, 40] },
    ...over,
  }
}

/** Une réponse par ville, choisie par le paramètre `latitude` de la requête. */
function routeFetch(routes: Record<string, () => Response | Promise<Response>>) {
  fetchMock.mockImplementation(async (url: string) => {
    const latitude = new URL(url).searchParams.get('latitude') ?? ''
    const route = routes[latitude]
    if (!route) throw new Error(`requête non prévue : ${url}`)
    return route()
  })
}

function setup(weather_locations: MockResult) {
  const m = mockSupabase({ tables: { weather_locations } })
  vi.mocked(createClient).mockResolvedValue(m.client as never)
  return m
}

beforeEach(() => {
  vi.mocked(createClient).mockReset()
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('toWeather', () => {
  it('rend la météo actuelle et le résumé du jour', () => {
    const weather = toWeather('Paris', forecast() as never)
    expect(weather.location).toBe('Paris')
    expect(weather.current).toEqual({ temperature: 5.5, weatherCode: 3 })
    expect(weather.today).toEqual({ min: 1, max: 8, precipitationProbability: 30 })
  })

  it('rend les 6 heures suivant l’heure courante, au format HH:MM', () => {
    const weather = toWeather('Paris', forecast() as never)
    expect(weather.hours.map((h) => h.time)).toEqual(['15:00', '16:00', '17:00', '18:00', '19:00', '20:00'])
    expect(weather.hours.map((h) => h.temperature)).toEqual([15, 16, 17, 18, 19, 20])
    expect(weather.hours.map((h) => h.precipitationProbability)).toEqual([null, 32, null, 36, null, 40])
    expect(weather.hours.map((h) => h.weatherCode)).toEqual([3, 0, 1, 2, 3, 0])
  })

  it('en rend moins quand la prévision s’arrête', () => {
    const weather = toWeather('Paris', forecast({ current: { time: '2026-01-15T21:30', temperature_2m: 3, weather_code: 0 } }) as never)
    expect(weather.hours.map((h) => h.time)).toEqual(['22:00', '23:00'])
  })

  it('rend [] quand l’heure courante est absente de la prévision', () => {
    const time = hours(10)
    const raw = forecast({
      hourly: { time, temperature_2m: time.map(() => 0), precipitation_probability: time.map(() => 0), weather_code: time.map(() => 0) },
    })
    expect(toWeather('Paris', raw as never).hours).toEqual([])
  })
})

describe('listLocations', () => {
  it('rend les villes dans l’ordre reçu', async () => {
    const m = setup({ data: [PARIS, LAUSANNE] })
    expect(await listLocations()).toEqual([PARIS, LAUSANNE])
    expect(m.calls.filter((c) => c.method === 'order').map((c) => c.args)).toEqual([['position'], ['created_at']])
  })

  it('rend Paris par défaut sans ville', async () => {
    setup({ data: [] })
    expect(await listLocations()).toEqual([DEFAULT_LOCATION])
  })

  it('lève l’erreur Supabase', async () => {
    const error = new Error('db down')
    setup({ error })
    await expect(listLocations()).rejects.toBe(error)
  })
})

describe('weatherConnector', () => {
  it('a l’id « weather »', () => {
    expect(weatherConnector.id).toBe('weather')
  })

  it('rend la météo de chaque ville, avec la date de la prévision en UTC', async () => {
    setup({ data: [PARIS, LAUSANNE] })
    routeFetch({ '48.8566': () => json(forecast()), '46.5197': () => json(forecast({ current: { time: '2026-01-15T10:00', temperature_2m: 1, weather_code: 0 } })) })
    const result = await weatherConnector.read('u1')
    expect(result.error).toBeUndefined()
    expect(result.data.map((c) => [c.id, c.label, c.weather?.current.temperature])).toEqual([
      ['p', 'Paris', 5.5],
      ['l', 'Lausanne', 1],
    ])
    // 14:15 locale avec un décalage de +1 h : 13:15 UTC.
    expect(result.syncedAt).toEqual(new Date('2026-01-15T13:15:00Z'))
  })

  it('interroge Open-Meteo avec les coordonnées de la ville', async () => {
    setup({ data: [PARIS] })
    routeFetch({ '48.8566': () => json(forecast()) })
    await weatherConnector.read('u1')
    const params = new URL(fetchMock.mock.calls[0][0]).searchParams
    expect(Object.fromEntries(params)).toMatchObject({ latitude: '48.8566', longitude: '2.3522', timezone: 'auto', forecast_days: '2' })
  })

  it('tient compte d’un décalage négatif', async () => {
    setup({ data: [PARIS] })
    routeFetch({ '48.8566': () => json(forecast({ utc_offset_seconds: -18000, current: { time: '2026-01-15T14:15', temperature_2m: 1, weather_code: 0 } })) })
    expect((await weatherConnector.read('u1')).syncedAt).toEqual(new Date('2026-01-15T19:15:00Z'))
  })

  it('montre les autres villes quand l’une répond une erreur HTTP', async () => {
    setup({ data: [PARIS, LAUSANNE] })
    routeFetch({ '48.8566': () => json({}, 500), '46.5197': () => json(forecast()) })
    const result = await weatherConnector.read('u1')
    expect(result.error).toBeUndefined()
    expect(result.data.map((c) => [c.label, c.weather === null])).toEqual([
      ['Paris', true],
      ['Lausanne', false],
    ])
    expect(result.syncedAt).toEqual(new Date('2026-01-15T13:15:00Z'))
    expect(console.error).toHaveBeenCalled()
  })

  it('montre les autres villes quand l’une ne répond pas du tout', async () => {
    setup({ data: [PARIS, LAUSANNE] })
    routeFetch({ '48.8566': () => json(forecast()), '46.5197': () => Promise.reject(new TypeError('fetch failed')) })
    const result = await weatherConnector.read('u1')
    expect(result.error).toBeUndefined()
    expect(result.data.map((c) => c.weather === null)).toEqual([false, true])
  })

  it.each([
    ['des erreurs HTTP', () => json({}, 503)],
    ['des échecs réseau', () => Promise.reject(new TypeError('fetch failed'))],
  ])('signale l’erreur quand toutes les villes échouent sur %s', async (_name, fail) => {
    setup({ data: [PARIS, LAUSANNE] })
    routeFetch({ '48.8566': fail, '46.5197': fail })
    const result = await weatherConnector.read('u1')
    expect(result.syncedAt).toBeNull()
    expect(result.error).toMatch(/^Météo indisponible : /)
    expect(result.data).toEqual([
      { id: 'p', label: 'Paris', weather: null },
      { id: 'l', label: 'Lausanne', weather: null },
    ])
  })

  it('retombe sur Paris quand la lecture des villes échoue, et interroge quand même Open-Meteo', async () => {
    setup({ error: new Error('db down') })
    routeFetch({ '48.8566': () => json(forecast()) })
    const result = await weatherConnector.read('u1')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(result.data.map((c) => [c.id, c.label])).toEqual([['default', 'Paris']])
    expect(result.data[0].weather).not.toBeNull()
    expect(console.error).toHaveBeenCalled()
  })

  it('retombe sur Paris quand aucune ville n’est configurée', async () => {
    setup({ data: [] })
    routeFetch({ '48.8566': () => json(forecast()) })
    expect((await weatherConnector.read('u1')).data.map((c) => c.label)).toEqual(['Paris'])
  })
})

describe('searchCities', () => {
  it('interroge le géocodage avec le nom, 5 résultats, en français', async () => {
    fetchMock.mockResolvedValue(json({ results: [] }))
    await searchCities('Lausanne & co')
    const url = new URL(fetchMock.mock.calls[0][0])
    expect(url.origin + url.pathname).toBe('https://geocoding-api.open-meteo.com/v1/search')
    expect(Object.fromEntries(url.searchParams)).toEqual({ name: 'Lausanne & co', count: '5', language: 'fr', format: 'json' })
  })

  it('rend le libellé, le détail « région, pays » et les coordonnées', async () => {
    fetchMock.mockResolvedValue(
      json({
        results: [
          { name: 'Lausanne', admin1: 'Vaud', country: 'Suisse', latitude: 46.5, longitude: 6.6 },
          { name: 'Paris', country: 'France', latitude: 48.8, longitude: 2.3 },
          { name: 'Lieu-dit', latitude: 1, longitude: 2 },
          { name: 'x'.repeat(100), admin1: '', country: 'Pays', latitude: 3, longitude: 4 },
        ],
      }),
    )
    const cities = await searchCities('x')
    expect(cities.map((c) => [c.label.length > 10 ? c.label.length : c.label, c.detail])).toEqual([
      ['Lausanne', 'Vaud, Suisse'],
      ['Paris', 'France'],
      ['Lieu-dit', ''],
      [80, 'Pays'],
    ])
    expect(cities[0]).toEqual({ label: 'Lausanne', detail: 'Vaud, Suisse', latitude: 46.5, longitude: 6.6 })
  })

  it('rend [] quand `results` est absent', async () => {
    fetchMock.mockResolvedValue(json({}))
    expect(await searchCities('introuvable')).toEqual([])
  })

  it('rejette une réponse non OK', async () => {
    fetchMock.mockResolvedValue(json({}, 503))
    await expect(searchCities('x')).rejects.toThrow('Open-Meteo geocoding HTTP 503')
  })
})
