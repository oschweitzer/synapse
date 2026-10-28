import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  SheetsError,
  appendValues,
  batchGetValues,
  batchUpdate,
  batchUpdateValues,
  getSpreadsheet,
  getValues,
  range,
  updateValues,
} from '@/lib/google/sheets'

const API = 'https://sheets.googleapis.com/v4/spreadsheets/'
const fetchMock = vi.fn()

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

/** Dernier appel à fetch : URL décodée, méthode, en-têtes et corps JSON. */
function lastCall() {
  const [url, init] = fetchMock.mock.calls.at(-1)!
  return {
    url: new URL(url as string),
    raw: url as string,
    method: init.method as string,
    headers: init.headers as Record<string, string>,
    body: init.body as string | undefined,
  }
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockResolvedValue(json({}))
})

describe('range', () => {
  it('cite le nom d’onglet et double les apostrophes', () => {
    expect(range('Catégories', 'A2:A')).toBe("'Catégories'!A2:A")
    expect(range("L'été", 'A1:B2')).toBe("'L''été'!A1:B2")
  })
})

describe('getSpreadsheet', () => {
  it('GET avec le paramètre fields et renvoie titre, locale et onglets', async () => {
    const sheet = { sheetId: 7, title: 'Dépenses', gridProperties: { rowCount: 100 } }
    fetchMock.mockResolvedValue(json({ properties: { title: 'Budget', locale: 'fr_FR' }, sheets: [{ properties: sheet }] }))
    expect(await getSpreadsheet('tok', 'abc')).toEqual({ title: 'Budget', locale: 'fr_FR', sheets: [sheet] })

    const call = lastCall()
    expect(call.raw.startsWith(`${API}abc?fields=`)).toBe(true)
    expect(call.url.searchParams.get('fields')).toContain('sheets.properties(sheetId,title')
    expect(call.method).toBe('GET')
    expect(call.headers.authorization).toBe('Bearer tok')
  })

  it('locale vaut null et sheets [] quand ils sont absents', async () => {
    fetchMock.mockResolvedValue(json({ properties: { title: 'Budget' } }))
    expect(await getSpreadsheet('tok', 'abc')).toEqual({ title: 'Budget', locale: null, sheets: [] })
  })

  it('encode l’identifiant du classeur dans l’URL', async () => {
    fetchMock.mockResolvedValue(json({ properties: { title: 'x' } }))
    await getSpreadsheet('tok', 'a/b c')
    expect(lastCall().raw.startsWith(`${API}a%2Fb%20c?`)).toBe(true)
  })
})

describe('batchGetValues / getValues', () => {
  it('envoie chaque plage avec les options de rendu brut', async () => {
    fetchMock.mockResolvedValue(json({ valueRanges: [{ values: [[1, 'a']] }, {}] }))
    expect(await batchGetValues('tok', 'abc', ["'A'!A1:B1", "'B'!A1"])).toEqual([[[1, 'a']], []])

    const { url, method } = lastCall()
    expect(url.pathname).toBe('/v4/spreadsheets/abc/values:batchGet')
    expect(method).toBe('GET')
    expect(url.searchParams.getAll('ranges')).toEqual(["'A'!A1:B1", "'B'!A1"])
    expect(url.searchParams.get('valueRenderOption')).toBe('UNFORMATTED_VALUE')
    expect(url.searchParams.get('dateTimeRenderOption')).toBe('SERIAL_NUMBER')
  })

  it('renvoie [] par plage quand la réponse n’a pas de valueRanges', async () => {
    fetchMock.mockResolvedValue(json({}))
    expect(await batchGetValues('tok', 'abc', ['A1'])).toEqual([[]])
  })

  it('getValues renvoie les valeurs de la première plage', async () => {
    fetchMock.mockResolvedValue(json({ valueRanges: [{ values: [['x']] }] }))
    expect(await getValues('tok', 'abc', 'A1')).toEqual([['x']])
  })
})

describe('écritures', () => {
  it('appendValues POSTe { values } en RAW / OVERWRITE', async () => {
    await appendValues('tok', 'abc', "'Dépenses'!A:D", [['a', 1, true, null]])
    const call = lastCall()
    expect(call.url.pathname).toBe(`/v4/spreadsheets/abc/values/${encodeURIComponent("'Dépenses'!A:D")}:append`)
    expect(call.url.searchParams.get('valueInputOption')).toBe('RAW')
    expect(call.url.searchParams.get('insertDataOption')).toBe('OVERWRITE')
    expect(call.method).toBe('POST')
    expect(call.headers['content-type']).toBe('application/json')
    expect(call.headers.authorization).toBe('Bearer tok')
    expect(JSON.parse(call.body!)).toEqual({ values: [['a', 1, true, null]] })
  })

  it('updateValues PUTe en RAW', async () => {
    await updateValues('tok', 'abc', 'A1:B1', [['x', 2]])
    const call = lastCall()
    expect(call.method).toBe('PUT')
    expect(call.url.pathname).toBe('/v4/spreadsheets/abc/values/A1%3AB1')
    expect(call.url.searchParams.get('valueInputOption')).toBe('RAW')
    expect(JSON.parse(call.body!)).toEqual({ values: [['x', 2]] })
  })

  it('batchUpdateValues POSTe valueInputOption et data', async () => {
    const data = [{ range: 'A1', values: [[1]] }]
    await batchUpdateValues('tok', 'abc', data)
    const call = lastCall()
    expect(call.method).toBe('POST')
    expect(call.url.pathname).toBe('/v4/spreadsheets/abc/values:batchUpdate')
    expect(JSON.parse(call.body!)).toEqual({ valueInputOption: 'RAW', data })
  })

  it('batchUpdate POSTe les requêtes', async () => {
    const requests = [{ deleteDimension: { range: { sheetId: 1 } } }]
    await batchUpdate('tok', 'abc', requests)
    const call = lastCall()
    expect(call.method).toBe('POST')
    expect(call.url.pathname).toBe('/v4/spreadsheets/abc:batchUpdate')
    expect(call.headers['content-type']).toBe('application/json')
    expect(JSON.parse(call.body!)).toEqual({ requests })
  })
})

describe('GET', () => {
  it('n’envoie ni content-type ni corps', async () => {
    fetchMock.mockResolvedValue(json({ valueRanges: [] }))
    await batchGetValues('tok', 'abc', ['A1'])
    const call = lastCall()
    expect(call.headers).toEqual({ authorization: 'Bearer tok' })
    expect(call.body).toBeUndefined()
  })
})

describe('erreurs', () => {
  it('lève SheetsError avec le statut et le message de Google', async () => {
    fetchMock.mockResolvedValue(json({ error: { message: 'The caller does not have permission' } }, 403))
    const error = await getValues('tok', 'abc', 'A1').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(SheetsError)
    expect((error as SheetsError).status).toBe(403)
    expect((error as SheetsError).message).toContain('403')
    expect((error as SheetsError).message).toContain('The caller does not have permission')
  })

  it('retombe sur statusText quand le corps n’est pas du JSON', async () => {
    fetchMock.mockResolvedValue(new Response('<html>', { status: 502, statusText: 'Bad Gateway' }))
    const error = await getValues('tok', 'abc', 'A1').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(SheetsError)
    expect((error as SheetsError).status).toBe(502)
    expect((error as SheetsError).message).toContain('Bad Gateway')
  })
})
