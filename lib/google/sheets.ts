/**
 * Appels à l'API Google Sheets v4, côté serveur, avec un jeton d'accès frais
 * (`refreshAccessToken`). Sans cache : celui des dépenses est posé au-dessus
 * (`lib/connectors/cash.ts`).
 */

const API = 'https://sheets.googleapis.com/v4/spreadsheets'

/** Réponse d'erreur de Google : 401 jeton refusé, 403 fichier non accordé, 404 fichier introuvable. */
export class SheetsError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

export type Cell = string | number | boolean | null

/** Nom d'onglet cité pour une plage A1 : `'Catégories'!A2:A`. */
export function range(sheet: string, cells: string) {
  return `'${sheet.replaceAll("'", "''")}'!${cells}`
}

async function call<T>(token: string, path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(`${API}/${path}`, {
    method: init?.method ?? 'GET',
    headers: {
      authorization: `Bearer ${token}`,
      ...(init?.body !== undefined && { 'content-type': 'application/json' }),
    },
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new SheetsError(res.status, `Google Sheets ${res.status} : ${body.error?.message ?? res.statusText}`)
  }
  return res.json() as Promise<T>
}

export type SheetProperties = { sheetId: number; title: string; gridProperties?: { rowCount?: number } }

/** Titre du fichier et liste de ses onglets. */
export async function getSpreadsheet(token: string, id: string) {
  const fields = 'properties(title,locale),sheets.properties(sheetId,title,gridProperties.rowCount)'
  const body = await call<{ properties: { title: string; locale?: string }; sheets?: { properties: SheetProperties }[] }>(
    token,
    `${encodeURIComponent(id)}?fields=${encodeURIComponent(fields)}`,
  )
  return { title: body.properties.title, locale: body.properties.locale ?? null, sheets: (body.sheets ?? []).map((s) => s.properties) }
}

/**
 * Valeurs brutes de plusieurs plages : nombres en nombre, dates en numéro de
 * série, quelle que soit la locale du fichier.
 */
export async function batchGetValues(token: string, id: string, ranges: string[]): Promise<Cell[][][]> {
  const query = new URLSearchParams({ valueRenderOption: 'UNFORMATTED_VALUE', dateTimeRenderOption: 'SERIAL_NUMBER' })
  for (const r of ranges) query.append('ranges', r)
  const body = await call<{ valueRanges?: { values?: Cell[][] }[] }>(token, `${encodeURIComponent(id)}/values:batchGet?${query}`)
  return ranges.map((_, i) => body.valueRanges?.[i]?.values ?? [])
}

/** Valeurs d'une plage, comme `batchGetValues`. */
export async function getValues(token: string, id: string, cells: string) {
  return (await batchGetValues(token, id, [cells]))[0]
}

/**
 * Ajout de lignes sous le tableau. `RAW` : rien n'est réinterprété comme texte
 * saisi. `OVERWRITE` : la ligne vide suivante est remplie, avec les formats et
 * validations déjà posés sur la colonne (la feuille s'agrandit seule au besoin).
 */
export async function appendValues(token: string, id: string, cells: string, values: Cell[][]) {
  const query = new URLSearchParams({ valueInputOption: 'RAW', insertDataOption: 'OVERWRITE' })
  return call(token, `${encodeURIComponent(id)}/values/${encodeURIComponent(cells)}:append?${query}`, {
    method: 'POST',
    body: { values },
  })
}

/** Réécriture d'une plage, en `RAW`. */
export async function updateValues(token: string, id: string, cells: string, values: Cell[][]) {
  return call(token, `${encodeURIComponent(id)}/values/${encodeURIComponent(cells)}?valueInputOption=RAW`, {
    method: 'PUT',
    body: { values },
  })
}

/** Plusieurs plages réécrites en une requête, en `RAW`. */
export async function batchUpdateValues(token: string, id: string, data: { range: string; values: Cell[][] }[]) {
  return call(token, `${encodeURIComponent(id)}/values:batchUpdate`, {
    method: 'POST',
    body: { valueInputOption: 'RAW', data },
  })
}

/** `spreadsheets.batchUpdate` : toutes les requêtes passent, ou aucune. */
export async function batchUpdate(token: string, id: string, requests: unknown[]) {
  return call(token, `${encodeURIComponent(id)}:batchUpdate`, { method: 'POST', body: { requests } })
}
