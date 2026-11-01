// Serveur factice des API externes pour les tests e2e : Google (jeton, Sheets),
// Open-Meteo et TheMealDB. Lancé par Playwright (`node e2e/mock-server.ts`).
// Node >= 22.18 retire les types nativement : uniquement de la syntaxe TypeScript
// effaçable (pas d'enum, de propriété de paramètre ni de namespace), aucun import local.
import { createServer } from 'node:http'

const PORT = Number(process.env.MOCK_PORT) || 4010
const HOST = '127.0.0.1'

type Json = Record<string, unknown>

/** Réponse Open-Meteo fixe : 48 heures à partir de l'heure courante, 7 jours. */
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
      time: Array.from({ length: 7 }, (_, i) =>
        new Date(start.getTime() + i * 86_400_000).toISOString().slice(0, 10),
      ),
      weather_code: [2, 2, 2, 2, 2, 2, 2],
      temperature_2m_max: [22, 21, 20, 19, 20, 21, 22],
      temperature_2m_min: [12, 11, 10, 9, 10, 11, 12],
      precipitation_probability_max: [20, 30, 40, 10, 0, 20, 30],
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

// Google Sheets, en mémoire --------------------------------------------------------

type Cell = string | number | boolean | null
type Tab = { sheetId: number; title: string; rows: Cell[][] }
type Spreadsheet = { title: string; tabs: Tab[] }

/** En-tête de `Saisies` (ENTRIES_HEADER de lib/cash.ts, recopié : aucun import local ici). */
const ENTRIES_HEADER = ['ID', 'Date', 'Montant', 'Catégorie', 'Remarque']

/** Classeurs par identifiant, créés au premier accès avec les onglets de Synapse. */
const spreadsheets = new Map<string, Spreadsheet>()

function spreadsheet(id: string): Spreadsheet {
  let book = spreadsheets.get(id)
  if (!book) {
    book = {
      title: 'Dépenses Liquide',
      tabs: [
        { sheetId: 0, title: 'Saisies', rows: [ENTRIES_HEADER] },
        { sheetId: 1, title: 'Catégories', rows: [['Catégorie'], ['Courses'], ['Transport']] },
        { sheetId: 2, title: 'Récap', rows: [] },
      ],
    }
    spreadsheets.set(id, book)
  }
  return book
}

/** Colonne A1 → index (A = 0). */
const columnIndex = (letters: string) => [...letters].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1

/** Plage A1 (`'Saisies'!A2:E`, `A:E`, `A5`) → onglet et bornes à base 0 ; `endRow` absent : jusqu'en bas. */
function parseRange(book: Spreadsheet, a1: string) {
  const match = /^'((?:[^']|'')+)'!([A-Z]+)(\d*)(?::([A-Z]+)(\d*))?$/.exec(a1)
  if (!match) return null
  const tab = book.tabs.find((t) => t.title === match[1].replaceAll("''", "'"))
  if (!tab) return null
  const startCol = columnIndex(match[2])
  return {
    tab,
    startCol,
    endCol: match[4] ? columnIndex(match[4]) : startCol,
    startRow: match[3] ? Number(match[3]) - 1 : 0,
    endRow: match[5] ? Number(match[5]) : match[4] ? undefined : match[3] ? Number(match[3]) : undefined,
  }
}

const blank = (row: Cell[]) => row.every((c) => c === null || c === '')

/** Comme Google : les lignes et cellules vides de fin ne sont pas rendues. */
function readRange(book: Spreadsheet, a1: string): Cell[][] {
  const r = parseRange(book, a1)
  if (!r) return []
  const rows = r.tab.rows.slice(r.startRow, r.endRow).map((row) => {
    const cells = row.slice(r.startCol, r.endCol + 1)
    while (cells.length && (cells[cells.length - 1] === null || cells[cells.length - 1] === '')) cells.pop()
    return cells
  })
  while (rows.length && rows[rows.length - 1].length === 0) rows.pop()
  return rows
}

/** Écrit `values` à partir du coin haut gauche de la plage, en agrandissant l'onglet au besoin. */
function writeRange(book: Spreadsheet, a1: string, values: Cell[][], atRow = parseRange(book, a1)?.startRow) {
  const r = parseRange(book, a1)
  if (!r || atRow === undefined) return 0
  values.forEach((cells, i) => {
    while (r.tab.rows.length <= atRow + i) r.tab.rows.push([])
    const row = r.tab.rows[atRow + i]
    cells.forEach((cell, j) => {
      while (row.length <= r.startCol + j) row.push(null)
      row[r.startCol + j] = cell
    })
  })
  return values.length
}

function sheetsRoute(method: string, rest: string, query: URLSearchParams, body: Json) {
  const id = decodeURIComponent(/^[^/:]+/.exec(rest)?.[0] ?? '')
  const action = decodeURIComponent(rest.slice(encodeURIComponent(id).length))
  const book = spreadsheet(id)
  const values = (body.values ?? []) as Cell[][]

  if (action === '/values:batchGet') {
    return { status: 200, body: { valueRanges: query.getAll('ranges').map((a1) => ({ range: a1, values: readRange(book, a1) })) } }
  }

  if (action === '/values:batchUpdate') {
    const data = (body.data ?? []) as { range: string; values: Cell[][] }[]
    for (const d of data) writeRange(book, d.range, d.values)
    return { status: 200, body: { totalUpdatedRows: data.length } }
  }

  if (action.startsWith('/values/') && action.endsWith(':append')) {
    const a1 = action.slice('/values/'.length, -':append'.length)
    const r = parseRange(book, a1)
    if (!r) return { status: 400, body: { error: { message: `Unable to parse range: ${a1}` } } }
    // Sous la dernière ligne non vide.
    let next = r.tab.rows.length
    while (next > 0 && blank(r.tab.rows[next - 1])) next--
    return { status: 200, body: { updates: { updatedRows: writeRange(book, a1, values, next) } } }
  }

  if (action.startsWith('/values/')) {
    const a1 = action.slice('/values/'.length)
    if (method === 'PUT') return { status: 200, body: { updatedRows: writeRange(book, a1, values) } }
    return { status: 200, body: { range: a1, values: readRange(book, a1) } }
  }

  if (action === ':batchUpdate') {
    const requests = (body.requests ?? []) as { deleteDimension?: { range: Json } }[]
    for (const { deleteDimension } of requests) {
      const range = deleteDimension?.range as { sheetId: number; startIndex: number; endIndex: number } | undefined
      const tab = book.tabs.find((t) => t.sheetId === range?.sheetId)
      if (range && tab) tab.rows.splice(range.startIndex, range.endIndex - range.startIndex)
    }
    return { status: 200, body: { replies: requests.map(() => ({})) } }
  }

  if (method === 'GET' && action === '') {
    return {
      status: 200,
      body: {
        spreadsheetId: id,
        properties: { title: book.title, locale: 'fr_CH' },
        sheets: book.tabs.map((t) => ({
          properties: { sheetId: t.sheetId, title: t.title, gridProperties: { rowCount: Math.max(1000, t.rows.length) } },
        })),
      },
    }
  }

  return { status: 404, body: { error: { message: 'not mocked' } } }
}

/** Renvoie la réponse JSON d'une route, ou `null` si elle n'est pas simulée. */
function route(method: string, path: string, query: URLSearchParams, body: Json): { status: number; body: Json } | null {
  if (path === '/health') return { status: 200, body: { ok: true } }

  // Efface les classeurs en mémoire : appelé par resetDatabase pour qu'un serveur réutilisé reparte de zéro.
  if (method === 'POST' && path === '/__reset') {
    spreadsheets.clear()
    return { status: 200, body: { ok: true } }
  }

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
    return sheetsRoute(method, path.slice('/sheets/v4/spreadsheets/'.length), query, body)
  }

  if (method === 'GET' && path === '/open-meteo/v1/forecast') return { status: 200, body: forecast() }

  if (method === 'GET' && path === '/geocoding/v1/search') {
    return {
      status: 200,
      body: {
        results: [
          { name: 'Strasbourg', admin1: 'Grand Est', country: 'France', latitude: 48.5734, longitude: 7.7521 },
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

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${HOST}`)
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  let payload: Json = {}
  try {
    payload = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
  } catch {
    // Corps non JSON (formulaire du jeton OAuth) : ignoré.
  }
  const found = route(req.method ?? 'GET', url.pathname, url.searchParams, payload)
  if (!found) console.warn(`[mock] route non simulée : ${req.method} ${url.pathname}`)
  const { status, body } = found ?? { status: 404, body: { error: 'not mocked' } }
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
})

server.listen(PORT, HOST, () => console.log(`[mock] http://${HOST}:${PORT}`))

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => server.close(() => process.exit(0)))
}
