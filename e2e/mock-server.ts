// Serveur factice des API externes pour les tests e2e : Google (jeton, Sheets),
// Open-Meteo et TheMealDB. Lancé par Playwright (`node e2e/mock-server.ts`).
// Node >= 22.18 retire les types nativement : uniquement de la syntaxe TypeScript
// effaçable (pas d'enum, de propriété de paramètre ni de namespace), aucun import local.
import { createServer } from 'node:http'

const PORT = Number(process.env.MOCK_PORT) || 4010
const HOST = '127.0.0.1'

type Json = Record<string, unknown>

/** Réponse Open-Meteo fixe : 48 heures à partir de l'heure courante, 2 jours. */
function forecast(): Json {
  const start = new Date()
  start.setUTCMinutes(0, 0, 0)
  const time = Array.from({ length: 48 }, (_, i) =>
    new Date(start.getTime() + i * 3_600_000).toISOString().slice(0, 16),
  )
  return {
    utc_offset_seconds: 0,
    current: { time: new Date().toISOString().slice(0, 16), temperature_2m: 18.5, weather_code: 2 },
    hourly: {
      time,
      temperature_2m: time.map((_, i) => 15 + (i % 8)),
      precipitation_probability: time.map((_, i) => (i % 3) * 10),
      weather_code: time.map(() => 2),
    },
    daily: {
      temperature_2m_max: [22, 21],
      temperature_2m_min: [12, 11],
      precipitation_probability_max: [20, 30],
    },
  }
}

const MEAL: Json = {
  idMeal: '52772',
  strMeal: 'Teriyaki Chicken Casserole',
  strInstructions: 'Preheat oven to 350 F.\r\nMix the ingredients.\r\nBake for 30 minutes.',
  strIngredient1: 'soy sauce',
  strMeasure1: '3/4 cup',
}

/** Renvoie la réponse JSON d'une route, ou `null` si elle n'est pas simulée. */
function route(method: string, path: string): { status: number; body: Json } | null {
  if (path === '/health') return { status: 200, body: { ok: true } }

  if (method === 'POST' && path === '/google/token') {
    return {
      status: 200,
      body: {
        access_token: 'e2e-access-token',
        refresh_token: 'e2e-refresh-token',
        expires_in: 3600,
        scope: 'openid email',
        token_type: 'Bearer',
      },
    }
  }

  if (path.startsWith('/sheets/v4/spreadsheets/')) {
    const rest = path.slice('/sheets/v4/spreadsheets/'.length)
    if (rest.includes(':batchGet')) return { status: 200, body: { valueRanges: [] } }
    if (rest.includes('/values')) {
      return { status: 200, body: method === 'GET' ? { range: '', values: [] } : { updates: {} } }
    }
    if (method === 'GET') return { status: 200, body: { spreadsheetId: rest, properties: { title: 'E2E' }, sheets: [] } }
    return { status: 200, body: { replies: [] } }
  }

  if (method === 'GET' && path === '/open-meteo/v1/forecast') return { status: 200, body: forecast() }

  if (method === 'GET' && path === '/geocoding/v1/search') {
    return {
      status: 200,
      body: {
        results: [
          { name: 'Paris', admin1: 'Île-de-France', country: 'France', latitude: 48.8566, longitude: 2.3522 },
        ],
      },
    }
  }

  if (
    method === 'GET' &&
    (path === '/mealdb/api/json/v1/1/search.php' || path === '/mealdb/api/json/v1/1/random.php')
  ) {
    return { status: 200, body: { meals: [MEAL] } }
  }

  return null
}

const server = createServer((req, res) => {
  const path = new URL(req.url ?? '/', `http://${HOST}`).pathname
  const found = route(req.method ?? 'GET', path)
  if (!found) console.warn(`[mock] route non simulée : ${req.method} ${path}`)
  const { status, body } = found ?? { status: 404, body: { error: 'not mocked' } }
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
})

server.listen(PORT, HOST, () => console.log(`[mock] http://${HOST}:${PORT}`))

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => server.close(() => process.exit(0)))
}
