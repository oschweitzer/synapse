import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { revalidateTag, unstable_cache } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { decryptToken } from '@/lib/google/crypto'
import { GoogleReauthError, SCOPE_DRIVE_FILE, refreshAccessToken } from '@/lib/google/oauth'
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
import { CATEGORIES_SHEET, ENTRIES_SHEET, RECAP_SHEET, entryToRow, isUuid, toSerial } from '@/lib/cash'
import { SOURCE_GID } from '@/lib/cash-migration'
import {
  CashError,
  addCategory,
  cashConnector,
  createEntry,
  deleteEntry,
  entriesOfMonth,
  invalidateCash,
  linkSheet,
  previewMigration,
  runMigration,
  unlinkSheet,
  updateEntry,
  type CashBook,
} from '@/lib/connectors/cash'
import { mockSupabase, type MockResult } from '@/test/supabase-mock'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('next/cache', () => ({ unstable_cache: vi.fn((fn: unknown) => fn), revalidateTag: vi.fn() }))
vi.mock('@/lib/google/crypto', () => ({ decryptToken: vi.fn() }))
// SheetsError, GoogleReauthError, range et SCOPE_DRIVE_FILE restent les vrais : le code les compare par instanceof.
vi.mock('@/lib/google/oauth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/google/oauth')>()),
  refreshAccessToken: vi.fn(),
}))
vi.mock('@/lib/google/sheets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/google/sheets')>()),
  getSpreadsheet: vi.fn(),
  batchGetValues: vi.fn(),
  getValues: vi.fn(),
  appendValues: vi.fn(),
  updateValues: vi.fn(),
  batchUpdateValues: vi.fn(),
  batchUpdate: vi.fn(),
}))

const NOW = new Date('2026-10-15T10:00:00Z')
const SHEET_ID = 'a'.repeat(30)
const TOKEN = 'at'
const REAUTH_MESSAGE = 'Reconnecte Google pour accéder au fichier.'

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

const ACCOUNT_ROW = { google_email: 'moi@x.fr', needs_reauth: false, scopes: [SCOPE_DRIVE_FILE] }

const SAISIES = { sheetId: 11, title: ENTRIES_SHEET }
const CATEGORIES = { sheetId: 12, title: CATEGORIES_SHEET }
const spreadsheet = (...sheets: { sheetId: number; title: string }[]) => ({ title: 'Dépenses', locale: null, sheets })

/** Sept dépenses d'octobre (1 à 7 CHF), une de septembre, une illisible (ligne 10 de la feuille). */
const ENTRY_ROWS: (string | number | null)[][] = [
  ...[1, 2, 3, 4, 5, 6, 7].map((n) => [uuid(n), toSerial(`2026-10-0${n}`), n, n % 2 ? 'Marché' : 'Café', n === 1 ? 'pain' : '']),
  [uuid(8), toSerial('2026-09-30'), 100, 'Marché', ''],
  [uuid(9), 'pas une date', 5, 'Café', ''],
]
const CATEGORY_ROWS = [['Marché'], ['Café'], ['Transport']]

/** Valeurs par défaut de `getValues`, selon la plage demandée. */
let sheetValues: Record<string, (string | number | null)[][]> = {}
const valuesOf = (cells: string) =>
  sheetValues[cells] ??
  (cells === range(CATEGORIES_SHEET, 'A2:A')
    ? CATEGORY_ROWS
    : cells === range(ENTRIES_SHEET, 'A2:A')
      ? ENTRY_ROWS.map((row) => [row[0]])
      : cells === range(ENTRIES_SHEET, 'A2:E')
        ? ENTRY_ROWS
        : [])

type Over = {
  account?: MockResult
  settings?: MockResult | MockResult[]
  user?: { id: string } | null
  rpc?: Record<string, MockResult>
}

function setup(over: Over = {}) {
  const m = mockSupabase({
    user: 'user' in over ? over.user : { id: 'u1' },
    tables: {
      google_accounts: over.account ?? { data: ACCOUNT_ROW },
      settings: over.settings ?? { data: { cash_sheet_id: SHEET_ID } },
    },
    rpc: { google_refresh_token: { data: 'cipher' }, flag_google_reauth: { error: null }, ...over.rpc },
  })
  vi.mocked(createClient).mockResolvedValue(m.client as never)
  return m
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  vi.spyOn(console, 'error').mockImplementation(() => {})
  sheetValues = {}

  vi.mocked(unstable_cache).mockImplementation(((fn: unknown) => fn) as never)
  vi.mocked(decryptToken).mockResolvedValue('rt')
  vi.mocked(refreshAccessToken).mockResolvedValue(TOKEN)
  vi.mocked(getSpreadsheet).mockResolvedValue(spreadsheet(SAISIES, CATEGORIES))
  vi.mocked(batchGetValues).mockResolvedValue([ENTRY_ROWS, CATEGORY_ROWS])
  vi.mocked(getValues).mockImplementation(async (_token, _id, cells) => valuesOf(cells))
  vi.mocked(appendValues).mockResolvedValue({})
  vi.mocked(updateValues).mockResolvedValue({})
  vi.mocked(batchUpdateValues).mockResolvedValue({})
  vi.mocked(batchUpdate).mockResolvedValue({})
})

afterEach(() => {
  vi.useRealTimers()
})

describe('CashError', () => {
  it('porte le statut, le message et le code', () => {
    const error = new CashError(404, 'Perdu', 'gone')
    expect(error).toBeInstanceOf(Error)
    expect(error).toMatchObject({ status: 404, message: 'Perdu', code: 'gone' })
    expect(new CashError(400, 'x').code).toBeUndefined()
  })
})

describe('entriesOfMonth / invalidateCash', () => {
  it('ne garde que les dépenses du mois demandé', () => {
    const book = {
      entries: [
        { id: '1', date: '2026-10-14', amount: 1, category: 'A', note: null },
        { id: '2', date: '2026-09-30', amount: 2, category: 'A', note: null },
      ],
    } as CashBook
    expect(entriesOfMonth(book, '2026-10').map((e) => e.id)).toEqual(['1'])
    expect(entriesOfMonth(book, '2026-11')).toEqual([])
  })

  it('expire tout de suite le cache de l’utilisateur', () => {
    invalidateCash('u1')
    expect(revalidateTag).toHaveBeenCalledWith('cash:u1', { expire: 0 })
  })
})

describe('cashConnector.read', () => {
  it('a l’id « cash »', () => {
    expect(cashConnector.id).toBe('cash')
  })

  it('rend le mois en cours, son total, les 5 dernières dépenses et les lignes illisibles', async () => {
    setup()
    const result = await cashConnector.read('u1')
    expect(result.error).toBeUndefined()
    expect(result.data).toMatchObject({
      status: 'ok',
      month: '2026-10',
      // 1 + … + 7 : la dépense de septembre (100) n'y est pas.
      monthTotal: 28,
      categories: ['Marché', 'Café', 'Transport'],
      unreadable: 1,
    })
    if (result.data.status !== 'ok') throw new Error('attendu : ok')
    expect(result.data.recent.map((e) => e.id)).toEqual([uuid(7), uuid(6), uuid(5), uuid(4), uuid(3)])
    expect(result.data.recent[0]).toEqual({ id: uuid(7), date: '2026-10-07', amount: 7, category: 'Marché', note: null })
  })

  it('date la lecture de l’horloge', async () => {
    setup()
    expect((await cashConnector.read('u1')).syncedAt).toEqual(NOW)
  })

  it('lit Saisies et Catégories en un seul appel, avec le jeton frais', async () => {
    setup()
    await cashConnector.read('u1')
    expect(refreshAccessToken).toHaveBeenCalledWith('rt')
    expect(decryptToken).toHaveBeenCalledWith('cipher')
    expect(batchGetValues).toHaveBeenCalledWith(TOKEN, SHEET_ID, [range(ENTRIES_SHEET, 'A2:E'), range(CATEGORIES_SHEET, 'A2:A')])
  })

  it('met la lecture en cache par utilisateur et par fichier, étiquetée pour l’invalidation', async () => {
    setup()
    await cashConnector.read('u1')
    expect(unstable_cache).toHaveBeenCalledWith(expect.any(Function), ['cash-book', 'u1', SHEET_ID], { revalidate: 180, tags: ['cash:u1'] })
  })

  it('écrit les ID manquants en une seule requête, sans toucher aux autres colonnes', async () => {
    setup()
    const serial = toSerial('2026-10-14')
    vi.mocked(batchGetValues).mockResolvedValue([
      [
        [null, serial, 5, 'Café', ''], // ligne 2
        [uuid(1), serial, 6, 'Café', ''],
        ['', serial, 7, 'Café', ''], // ligne 4
      ],
      CATEGORY_ROWS,
    ])
    await cashConnector.read('u1')
    expect(batchUpdateValues).toHaveBeenCalledTimes(1)
    expect(batchUpdateValues).toHaveBeenCalledWith(TOKEN, SHEET_ID, [
      { range: range(ENTRIES_SHEET, 'A2'), values: [[expect.any(String)]] },
      { range: range(ENTRIES_SHEET, 'A4'), values: [[expect.any(String)]] },
    ])
  })

  it('n’écrit rien quand toutes les lignes ont un ID', async () => {
    setup()
    await cashConnector.read('u1')
    expect(batchUpdateValues).not.toHaveBeenCalled()
  })

  it('rend « google-disconnected » sans compte Google, sans appeler Google', async () => {
    setup({ account: { data: null } })
    expect(await cashConnector.read('u1')).toEqual({ data: { status: 'google-disconnected' }, syncedAt: null })
    expect(getSpreadsheet).not.toHaveBeenCalled()
    expect(refreshAccessToken).not.toHaveBeenCalled()
  })

  it('rend « google-reauth » quand la reconnexion est demandée', async () => {
    setup({ account: { data: { ...ACCOUNT_ROW, needs_reauth: true } } })
    expect((await cashConnector.read('u1')).data).toEqual({ status: 'google-reauth' })
  })

  it('rend « needs-scope » sans la permission drive.file', async () => {
    setup({ account: { data: { ...ACCOUNT_ROW, scopes: ['openid'] } } })
    expect((await cashConnector.read('u1')).data).toEqual({ status: 'needs-scope' })
  })

  it('rend « no-sheet » avec le compte proposé au Picker quand aucun fichier n’est choisi', async () => {
    setup({ settings: { data: null } })
    expect((await cashConnector.read('u1')).data).toEqual({ status: 'no-sheet', googleEmail: 'moi@x.fr' })
    setup({ settings: { data: { cash_sheet_id: null } } })
    expect((await cashConnector.read('u1')).data).toEqual({ status: 'no-sheet', googleEmail: 'moi@x.fr' })
  })

  it('rend « needs-migration » sans onglet Saisies', async () => {
    setup()
    vi.mocked(getSpreadsheet).mockResolvedValue(spreadsheet({ sheetId: 5, title: '2026' }))
    const result = await cashConnector.read('u1')
    expect(result).toEqual({ data: { status: 'needs-migration', sheetId: SHEET_ID, title: 'Dépenses' }, syncedAt: null })
    expect(batchGetValues).not.toHaveBeenCalled()
  })

  it('rend « ok » avec un total nul pour une feuille vide', async () => {
    setup()
    vi.mocked(batchGetValues).mockResolvedValue([[], []])
    const result = await cashConnector.read('u1')
    expect(result.data).toEqual({ status: 'ok', month: '2026-10', monthTotal: 0, recent: [], categories: [], unreadable: 0 })
  })

  it('lit sans catégories quand l’onglet Catégories manque', async () => {
    setup()
    vi.mocked(getSpreadsheet).mockResolvedValue(spreadsheet(SAISIES))
    vi.mocked(batchGetValues).mockResolvedValue([ENTRY_ROWS])
    const result = await cashConnector.read('u1')
    expect(batchGetValues).toHaveBeenCalledWith(TOKEN, SHEET_ID, [range(ENTRIES_SHEET, 'A2:E')])
    expect(result.data).toMatchObject({ status: 'ok', categories: [] })
  })

  it('traduit un 404 de Google en message, sans demander de reconnexion', async () => {
    const m = setup()
    vi.mocked(getSpreadsheet).mockRejectedValue(new SheetsError(404, 'Google Sheets 404 : introuvable'))
    const result = await cashConnector.read('u1')
    expect(result).toEqual({ data: { status: 'error' }, syncedAt: null, error: expect.stringContaining('n’a pas accès à ce fichier') })
    expect(m.rpc).not.toHaveBeenCalledWith('flag_google_reauth')
  })

  it('traduit un 403 comme un 404', async () => {
    setup()
    vi.mocked(getSpreadsheet).mockRejectedValue(new SheetsError(403, 'Google Sheets 403'))
    expect((await cashConnector.read('u1')).error).toContain('n’a pas accès à ce fichier')
  })

  it('traduit un 400 en format inattendu', async () => {
    setup()
    vi.mocked(getSpreadsheet).mockRejectedValue(new SheetsError(400, 'Google Sheets 400'))
    expect((await cashConnector.read('u1')).error).toContain('format attendu')
  })

  it('traduit un 401 en reconnexion et pose le bandeau « Reconnecter Google »', async () => {
    const m = setup()
    vi.mocked(getSpreadsheet).mockRejectedValue(new SheetsError(401, 'Google Sheets 401'))
    expect(await cashConnector.read('u1')).toEqual({ data: { status: 'error' }, syncedAt: null, error: REAUTH_MESSAGE })
    expect(m.rpc).toHaveBeenCalledWith('flag_google_reauth')
  })

  it('continue quand le bandeau « Reconnecter Google » ne peut pas être posé', async () => {
    setup({ rpc: { flag_google_reauth: { error: new Error('rpc down') } } })
    vi.mocked(getSpreadsheet).mockRejectedValue(new SheetsError(401, 'Google Sheets 401'))
    expect((await cashConnector.read('u1')).error).toBe(REAUTH_MESSAGE)
    expect(console.error).toHaveBeenCalled()
  })

  it('demande la reconnexion quand Google refuse le jeton de rafraîchissement', async () => {
    const m = setup()
    vi.mocked(refreshAccessToken).mockRejectedValue(new GoogleReauthError('invalid_grant'))
    expect(await cashConnector.read('u1')).toEqual({ data: { status: 'error' }, syncedAt: null, error: REAUTH_MESSAGE })
    expect(m.rpc).toHaveBeenCalledWith('flag_google_reauth')
    expect(getSpreadsheet).not.toHaveBeenCalled()
  })

  it('demande la reconnexion quand le jeton chiffré est illisible', async () => {
    const m = setup()
    vi.mocked(decryptToken).mockResolvedValue(null as never)
    expect((await cashConnector.read('u1')).error).toBe(REAUTH_MESSAGE)
    expect(m.rpc).toHaveBeenCalledWith('flag_google_reauth')
    expect(refreshAccessToken).not.toHaveBeenCalled()
  })

  it('demande la reconnexion sans jeton chiffré en base', async () => {
    setup({ rpc: { google_refresh_token: { data: null } } })
    expect((await cashConnector.read('u1')).error).toBe(REAUTH_MESSAGE)
    expect(decryptToken).not.toHaveBeenCalled()
  })

  it('demande de se reconnecter sans session', async () => {
    setup({ user: null })
    expect(await cashConnector.read('u1')).toEqual({
      data: { status: 'error' },
      syncedAt: null,
      error: 'Session expirée, reconnecte-toi.',
    })
  })

  it('lève l’erreur Supabase de lecture des réglages', async () => {
    const error = new Error('settings down')
    setup({ settings: { error } })
    await expect(cashConnector.read('u1')).rejects.toBe(error)
  })

  it('lève l’erreur Supabase de lecture du compte Google', async () => {
    const error = new Error('accounts down')
    setup({ account: { error } })
    await expect(cashConnector.read('u1')).rejects.toBe(error)
  })

  it('lève l’erreur Supabase de lecture du jeton', async () => {
    const error = new Error('rpc down')
    setup({ rpc: { google_refresh_token: { error } } })
    await expect(cashConnector.read('u1')).rejects.toBe(error)
  })

  it('laisse remonter une erreur qui n’est pas une CashError', async () => {
    setup()
    const error = new Error('boum')
    vi.mocked(getSpreadsheet).mockRejectedValue(error)
    await expect(cashConnector.read('u1')).rejects.toBe(error)
  })
})

describe('createEntry', () => {
  const raw = { date: '2026-10-14', amount: 12.5, category: 'marché', note: ' pain ' }

  it('ajoute une ligne sous Saisies, date en numéro de série, catégorie telle que stockée', async () => {
    setup()
    const created = await createEntry(raw)
    expect(created).toEqual({ id: expect.any(String), date: '2026-10-14', amount: 12.5, category: 'Marché', note: 'pain' })
    expect(isUuid(created.id)).toBe(true)
    expect(appendValues).toHaveBeenCalledWith(TOKEN, SHEET_ID, range(ENTRIES_SHEET, 'A:E'), [
      [created.id, toSerial('2026-10-14'), 12.5, 'Marché', 'pain'],
    ])
  })

  it('invalide le cache de l’utilisateur', async () => {
    setup()
    await createEntry(raw)
    expect(revalidateTag).toHaveBeenCalledWith('cash:u1', { expire: 0 })
  })

  it('refuse une saisie invalide avec un 400, sans écrire', async () => {
    setup()
    await expect(createEntry({ ...raw, date: '2026-04-31' })).rejects.toMatchObject({ status: 400, message: 'Date invalide.' })
    await expect(createEntry({ ...raw, category: 'Inconnue' })).rejects.toBeInstanceOf(CashError)
    expect(appendValues).not.toHaveBeenCalled()
    expect(revalidateTag).not.toHaveBeenCalled()
  })

  it.each([
    ['sans compte Google', { account: { data: null } }],
    ['sans fichier choisi', { settings: { data: null } }],
    ['avec une reconnexion demandée', { account: { data: { ...ACCOUNT_ROW, needs_reauth: true } } }],
  ] satisfies [string, Over][])('refuse avec un 409 %s', async (_name, over) => {
    setup(over)
    await expect(createEntry(raw)).rejects.toMatchObject({ status: 409 })
    expect(appendValues).not.toHaveBeenCalled()
  })

  it('refuse sans session avec un 401', async () => {
    setup({ user: null })
    await expect(createEntry(raw)).rejects.toMatchObject({ status: 401 })
  })

  it('traduit un refus d’accès de Google en 409', async () => {
    setup()
    vi.mocked(appendValues).mockRejectedValue(new SheetsError(403, 'Google Sheets 403'))
    await expect(createEntry(raw)).rejects.toMatchObject({ status: 409, message: expect.stringContaining('n’a pas accès') })
    expect(revalidateTag).not.toHaveBeenCalled()
  })

  it('traduit un jeton refusé en 401 « reauth » et pose le bandeau', async () => {
    const m = setup()
    vi.mocked(appendValues).mockRejectedValue(new SheetsError(401, 'Google Sheets 401'))
    await expect(createEntry(raw)).rejects.toMatchObject({ status: 401, code: 'reauth' })
    expect(m.rpc).toHaveBeenCalledWith('flag_google_reauth')
  })
})

describe('updateEntry', () => {
  const raw = { date: '2026-10-14', amount: 20, category: 'Café', note: null }

  it('rend un 404 « gone » pour un id qui n’est pas un UUID, sans appeler Google', async () => {
    await expect(updateEntry('pas-un-uuid', raw)).rejects.toMatchObject({ status: 404, code: 'gone' })
    expect(createClient).not.toHaveBeenCalled()
    expect(getValues).not.toHaveBeenCalled()
    expect(refreshAccessToken).not.toHaveBeenCalled()
  })

  it('rend un 404 « gone » quand l’id n’est plus dans la colonne A', async () => {
    setup()
    await expect(updateEntry(uuid(99), raw)).rejects.toMatchObject({ status: 404, code: 'gone' })
    expect(updateValues).not.toHaveBeenCalled()
  })

  it('réécrit la ligne trouvée par son ID', async () => {
    setup()
    const updated = await updateEntry(uuid(3), raw)
    expect(updated).toEqual({ id: uuid(3), date: '2026-10-14', amount: 20, category: 'Café', note: null })
    // uuid(3) est la 3e dépense : ligne 4 de la feuille.
    expect(updateValues).toHaveBeenCalledWith(TOKEN, SHEET_ID, range(ENTRIES_SHEET, 'A4:E4'), [
      entryToRow(uuid(3), { date: '2026-10-14', amount: 20, category: 'Café', note: null }),
    ])
    expect(revalidateTag).toHaveBeenCalledWith('cash:u1', { expire: 0 })
  })

  it('retrouve l’ID sans tenir compte de la casse ni des espaces', async () => {
    setup()
    sheetValues[range(ENTRIES_SHEET, 'A2:A')] = [[' ' + uuid(1).toUpperCase() + ' '], [uuid(2)]]
    await updateEntry(uuid(1), raw)
    expect(updateValues).toHaveBeenCalledWith(TOKEN, SHEET_ID, range(ENTRIES_SHEET, 'A2:E2'), expect.any(Array))
  })

  it('refuse une saisie invalide avec un 400, sans écrire', async () => {
    setup()
    await expect(updateEntry(uuid(1), { ...raw, amount: 0 })).rejects.toMatchObject({ status: 400 })
    expect(updateValues).not.toHaveBeenCalled()
  })
})

describe('deleteEntry', () => {
  it('rend un 404 « gone » pour un id qui n’est pas un UUID, sans appeler Google', async () => {
    await expect(deleteEntry('x')).rejects.toMatchObject({ status: 404, code: 'gone' })
    expect(createClient).not.toHaveBeenCalled()
    expect(batchUpdate).not.toHaveBeenCalled()
  })

  it('rend un 404 « gone » quand la ligne a disparu', async () => {
    setup()
    await expect(deleteEntry(uuid(99))).rejects.toMatchObject({ status: 404, code: 'gone' })
    expect(batchUpdate).not.toHaveBeenCalled()
  })

  it('supprime la ligne de l’onglet Saisies', async () => {
    setup()
    await deleteEntry(uuid(2))
    // uuid(2) est à la ligne 3 de la feuille : index 2 (base 0), fin exclue.
    expect(batchUpdate).toHaveBeenCalledWith(TOKEN, SHEET_ID, [
      { deleteDimension: { range: { sheetId: SAISIES.sheetId, dimension: 'ROWS', startIndex: 2, endIndex: 3 } } },
    ])
    expect(revalidateTag).toHaveBeenCalledWith('cash:u1', { expire: 0 })
  })

  it('rend un 409 sans onglet Saisies', async () => {
    setup()
    vi.mocked(getSpreadsheet).mockResolvedValue(spreadsheet(CATEGORIES))
    await expect(deleteEntry(uuid(2))).rejects.toMatchObject({ status: 409, message: 'Onglet Saisies introuvable.' })
    expect(batchUpdate).not.toHaveBeenCalled()
  })
})

describe('addCategory', () => {
  it('ne réécrit pas une catégorie existante, casse ignorée, et rend son nom stocké', async () => {
    setup()
    expect(await addCategory('MARCHÉ')).toBe('Marché')
    expect(appendValues).not.toHaveBeenCalled()
    expect(revalidateTag).not.toHaveBeenCalled()
  })

  it('ajoute une nouvelle catégorie en bas de l’onglet Catégories', async () => {
    setup()
    expect(await addCategory('  Sport   club ')).toBe('Sport club')
    expect(appendValues).toHaveBeenCalledWith(TOKEN, SHEET_ID, range(CATEGORIES_SHEET, 'A:A'), [['Sport club']])
    expect(revalidateTag).toHaveBeenCalledWith('cash:u1', { expire: 0 })
  })

  it('refuse un nom invalide avec un 400', async () => {
    setup()
    await expect(addCategory('')).rejects.toMatchObject({ status: 400, message: 'Donne un nom à la catégorie.' })
    await expect(addCategory('=SOMME(A1)')).rejects.toMatchObject({ status: 400 })
    expect(appendValues).not.toHaveBeenCalled()
  })
})

describe('linkSheet', () => {
  it.each([42, null, undefined, '', 'court', 'a'.repeat(19), 'a'.repeat(101), `${'a'.repeat(30)}/../x`])(
    'refuse l’id de fichier %j avec un 400, sans appeler Supabase',
    async (value) => {
      await expect(linkSheet(value)).rejects.toMatchObject({ status: 400, message: 'Fichier invalide.' })
      expect(createClient).not.toHaveBeenCalled()
    },
  )

  it('refuse avec un 409 sans compte Google utilisable', async () => {
    setup({ account: { data: null } })
    await expect(linkSheet(SHEET_ID)).rejects.toMatchObject({ status: 409, message: 'Reconnecte Google d’abord.' })
    expect(getSpreadsheet).not.toHaveBeenCalled()
  })

  it('vérifie le fichier avec le jeton du serveur puis l’enregistre', async () => {
    const m = setup({ settings: [{ data: null }, { error: null }] })
    expect(await linkSheet(SHEET_ID)).toEqual({ title: 'Dépenses' })
    expect(getSpreadsheet).toHaveBeenCalledWith(TOKEN, SHEET_ID)
    expect(m.calls).toContainEqual({
      schema: 'synapse',
      table: 'settings',
      method: 'upsert',
      args: [{ user_id: 'u1', cash_sheet_id: SHEET_ID }, { onConflict: 'user_id' }],
    })
    expect(revalidateTag).toHaveBeenCalledWith('cash:u1', { expire: 0 })
  })

  it('accepte aussi de remplacer un fichier déjà choisi', async () => {
    setup({ settings: [{ data: { cash_sheet_id: 'b'.repeat(30) } }, { error: null }] })
    expect(await linkSheet(SHEET_ID)).toEqual({ title: 'Dépenses' })
  })

  it('rend un 500 quand l’enregistrement échoue', async () => {
    setup({ settings: [{ data: null }, { error: new Error('db down') }] })
    await expect(linkSheet(SHEET_ID)).rejects.toMatchObject({ status: 500, message: 'Enregistrement impossible, réessaie.' })
    expect(console.error).toHaveBeenCalled()
    expect(revalidateTag).not.toHaveBeenCalled()
  })

  it('n’enregistre pas un fichier que Google refuse', async () => {
    const m = setup({ settings: [{ data: null }, { error: null }] })
    vi.mocked(getSpreadsheet).mockRejectedValue(new SheetsError(404, 'Google Sheets 404'))
    await expect(linkSheet(SHEET_ID)).rejects.toMatchObject({ status: 409 })
    expect(m.calls.some((c) => c.method === 'upsert')).toBe(false)
  })
})

describe('unlinkSheet', () => {
  it('oublie le fichier de l’utilisateur', async () => {
    const m = setup({ settings: { error: null } })
    await unlinkSheet()
    expect(m.calls).toContainEqual({ schema: 'synapse', table: 'settings', method: 'update', args: [{ cash_sheet_id: null }] })
    expect(m.calls).toContainEqual({ schema: 'synapse', table: 'settings', method: 'eq', args: ['user_id', 'u1'] })
    expect(revalidateTag).toHaveBeenCalledWith('cash:u1', { expire: 0 })
  })

  it('rend un 500 quand l’enregistrement échoue', async () => {
    setup({ settings: { error: new Error('db down') } })
    await expect(unlinkSheet()).rejects.toMatchObject({ status: 500, message: 'Enregistrement impossible, réessaie.' })
    expect(revalidateTag).not.toHaveBeenCalled()
  })

  it('refuse sans session avec un 401', async () => {
    setup({ user: null })
    await expect(unlinkSheet()).rejects.toMatchObject({ status: 401 })
  })
})

describe('migration', () => {
  const HEADER = ['Date', 'Mois', 'Catégorie', 'Montant (CHF)', 'Remarque']
  const SOURCE_RANGE = range('2026', 'A1:F')
  const SOURCE_TAB = { sheetId: SOURCE_GID, title: '2026' }

  const GOOD_GRID = [
    HEADER,
    [toSerial('2026-10-01'), 'Octobre', 'Marché ', 12.5, 'pain'],
    ['02.10.2026', 'Octobre', 'Café', '3,50', ''],
    ['TOTAL 2026', '', '', 16, ''],
  ]
  const BAD_GRID = [HEADER, [toSerial('2026-10-01'), 'Octobre', 'Marché', 12.5, ''], ['24.20.2026', 'Octobre', 'Café', 7, '']]

  /** Fichier encore dans son ancien format : seul l'onglet source existe. */
  function legacy(grid: (string | number | null)[][] | unknown[][], ...others: { sheetId: number; title: string }[]) {
    vi.mocked(getSpreadsheet).mockResolvedValue(spreadsheet(SOURCE_TAB, ...others))
    sheetValues[SOURCE_RANGE] = grid as (string | number | null)[][]
  }

  describe('runMigration', () => {
    it('ne fait rien quand Saisies existe déjà (idempotent)', async () => {
      setup()
      expect(await runMigration({})).toEqual({ status: 'already-migrated' })
      expect(batchUpdate).not.toHaveBeenCalled()
      expect(getValues).not.toHaveBeenCalled()
      expect(revalidateTag).not.toHaveBeenCalled()
    })

    it('renvoie les anomalies sans correction, sans rien écrire', async () => {
      setup()
      legacy(BAD_GRID)
      expect(await runMigration({})).toEqual({ errors: [{ row: 3, message: 'Date invalide.' }] })
      expect(batchUpdate).not.toHaveBeenCalled()
    })

    it('migre en un seul batchUpdate et rend les comptes de la source et de Saisies', async () => {
      setup()
      legacy(GOOD_GRID)
      sheetValues[range(ENTRIES_SHEET, 'A2:E')] = [
        [uuid(1), toSerial('2026-10-01'), 12.5, 'Marché', 'pain'],
        [uuid(2), toSerial('2026-10-02'), 3.5, 'Café', ''],
      ]
      expect(await runMigration({})).toEqual({
        status: 'migrated',
        source: { count: 2, total: 16, declaredTotal: 16, excluded: 0 },
        migrated: { count: 2, total: 16 },
      })
      expect(batchUpdate).toHaveBeenCalledTimes(1)
      expect(revalidateTag).toHaveBeenCalledWith('cash:u1', { expire: 0 })
    })

    it('crée les trois onglets avec des ids libres et y écrit les lignes migrées', async () => {
      setup()
      legacy(GOOD_GRID)
      await runMigration({})
      type Created = { addSheet: { properties: { sheetId: number; title: string } } }
      type Write = { updateCells: { start: object; rows: { values: { userEnteredValue: { stringValue: string } }[] }[] } }
      const [token, sheetId, requests] = vi.mocked(batchUpdate).mock.calls[0] as unknown as [string, string, (Created & Write)[]]
      expect([token, sheetId]).toEqual([TOKEN, SHEET_ID])
      const created = requests.slice(0, 3).map((r) => r.addSheet.properties)
      expect(created.map((p) => p.title)).toEqual([ENTRIES_SHEET, CATEGORIES_SHEET, RECAP_SHEET])
      expect(new Set(created.map((p) => p.sheetId)).size).toBe(3)
      expect(created.some((p) => p.sheetId === SOURCE_GID)).toBe(false)
      const write = requests[requests.length - 1].updateCells
      expect(write.start).toMatchObject({ sheetId: created[0].sheetId, rowIndex: 1, columnIndex: 0 })
      expect(write.rows).toHaveLength(2)
      expect(isUuid(write.rows[0].values[0].userEnteredValue.stringValue)).toBe(true)
    })

    it('applique les corrections validées et compte les lignes exclues', async () => {
      setup()
      legacy(BAD_GRID)
      sheetValues[range(ENTRIES_SHEET, 'A2:E')] = [[uuid(1), toSerial('2026-10-01'), 12.5, 'Marché', '']]
      const report = await runMigration({ '3': { excluded: true } })
      expect(report).toMatchObject({ status: 'migrated', source: { count: 2, excluded: 1 }, migrated: { count: 1, total: 12.5 } })
    })

    it('migre la ligne corrigée', async () => {
      setup()
      legacy(BAD_GRID)
      sheetValues[range(ENTRIES_SHEET, 'A2:E')] = [
        [uuid(1), toSerial('2026-10-01'), 12.5, 'Marché', ''],
        [uuid(2), toSerial('2026-10-24'), 7, 'Café', ''],
      ]
      const report = await runMigration({ '3': { date: '2026-10-24' } })
      expect(report).toMatchObject({ status: 'migrated', migrated: { count: 2, total: 19.5 } })
    })

    it('trouve l’onglet source par son nom quand son gid a changé', async () => {
      setup()
      vi.mocked(getSpreadsheet).mockResolvedValue(spreadsheet({ sheetId: 7, title: '2026' }))
      sheetValues[SOURCE_RANGE] = GOOD_GRID
      sheetValues[range(ENTRIES_SHEET, 'A2:E')] = []
      expect(await runMigration({})).toMatchObject({ status: 'migrated' })
    })

    it('rend un 409 sans onglet source', async () => {
      setup()
      vi.mocked(getSpreadsheet).mockResolvedValue(spreadsheet({ sheetId: 5, title: 'Autre' }))
      await expect(runMigration({})).rejects.toMatchObject({ status: 409, message: 'Onglet source « 2026 » introuvable.' })
      expect(batchUpdate).not.toHaveBeenCalled()
    })

    it('rend un 409 quand un onglet Catégories ou Récap existe déjà', async () => {
      setup()
      legacy(GOOD_GRID, { sheetId: 9, title: RECAP_SHEET })
      await expect(runMigration({})).rejects.toMatchObject({ status: 409, message: expect.stringContaining('« Récap » existe déjà') })
      expect(batchUpdate).not.toHaveBeenCalled()
    })

    it('exige un fichier choisi', async () => {
      setup({ settings: { data: null } })
      await expect(runMigration({})).rejects.toMatchObject({ status: 409 })
    })
  })

  describe('previewMigration', () => {
    it('rend le plan sans rien écrire', async () => {
      setup()
      legacy(GOOD_GRID)
      const preview = await previewMigration()
      expect(preview).toMatchObject({ status: 'ready', title: 'Dépenses', sourceTitle: '2026' })
      if (preview.status !== 'ready') throw new Error('attendu : ready')
      expect(preview.plan).toMatchObject({ total: 16, declaredTotal: 16, categories: ['Café', 'Marché'] })
      expect(preview.plan.rows).toHaveLength(2)
      expect(batchUpdate).not.toHaveBeenCalled()
      expect(revalidateTag).not.toHaveBeenCalled()
    })

    it('rend « already-migrated » quand Saisies existe', async () => {
      setup()
      expect(await previewMigration()).toEqual({ status: 'already-migrated' })
    })

    it('rend une erreur sans onglet source', async () => {
      setup()
      vi.mocked(getSpreadsheet).mockResolvedValue(spreadsheet({ sheetId: 5, title: 'Autre' }))
      expect(await previewMigration()).toEqual({ status: 'error', message: 'Onglet source « 2026 » introuvable.' })
    })

    it('rend une erreur quand Catégories existe déjà', async () => {
      setup()
      legacy(GOOD_GRID, CATEGORIES)
      const preview = await previewMigration()
      expect(preview).toMatchObject({ status: 'error', message: expect.stringContaining('Un onglet « Catégories » existe déjà') })
    })

    it('rend l’erreur de lecture de l’onglet source', async () => {
      setup()
      legacy([['rien', 'ici']])
      const preview = await previewMigration()
      expect(preview).toMatchObject({ status: 'error', message: expect.stringContaining('En-tête') })
    })
  })
})
