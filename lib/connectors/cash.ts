import { revalidateTag, unstable_cache } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { decryptToken } from '@/lib/google/crypto'
import { GoogleReauthError, refreshAccessToken, SCOPE_DRIVE_FILE } from '@/lib/google/oauth'
import {
  appendValues,
  batchGetValues,
  batchUpdate,
  batchUpdateValues,
  getSpreadsheet,
  getValues,
  range,
  SheetsError,
  updateValues,
} from '@/lib/google/sheets'
import {
  CATEGORIES_SHEET,
  ENTRIES_SHEET,
  entryToRow,
  isUuid,
  parseCategories,
  parseEntries,
  RECAP_SHEET,
  sortByDateDesc,
  sumAmounts,
  validateCategory,
  validateEntry,
  type CashEntry,
} from '@/lib/cash'
import {
  applyCorrections,
  freeSheetIds,
  migrationRequests,
  planMigration,
  SOURCE_GID,
  SOURCE_RANGE,
  SOURCE_TITLE,
  type Correction,
  type MigrationPlan,
} from '@/lib/cash-migration'
import { dayKey } from '@/lib/time'
import { readGoogleAccount } from './google'
import type { Connector } from './types'

/**
 * Dépenses cash, dans le Google Sheet choisi (`synapse.settings.cash_sheet_id`).
 * Le fichier reste la source de vérité : Synapse le lit à la demande, avec un
 * cache Next de quelques minutes invalidé après chaque écriture, et n'en garde
 * rien en base. Appels faits par le serveur Next avec le refresh token Google
 * (déchiffré ici, jamais envoyé au navigateur).
 */

/** Durée du cache de lecture, en secondes. */
const CACHE_SECONDS = 180
/** Dépenses affichées dans le widget. */
const RECENT_COUNT = 5

const cashTag = (userId: string) => `cash:${userId}`

/** Erreur montrée telle quelle à l'utilisateur, avec son statut HTTP. */
export class CashError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: 'gone' | 'reauth',
  ) {
    super(message)
  }
}

export type CashSetup =
  | { status: 'google-disconnected' }
  | { status: 'google-reauth' }
  /** Google connecté avant l'ajout de `drive.file` : reconnexion nécessaire. */
  | { status: 'needs-scope' }
  /** `googleEmail` : compte proposé au Picker. */
  | { status: 'no-sheet'; googleEmail: string | null }
  | { status: 'ready'; sheetId: string }

type Session = { supabase: Awaited<ReturnType<typeof createClient>>; userId: string }

async function session(): Promise<Session> {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (!data.user) throw new CashError(401, 'Session expirée, reconnecte-toi.')
  return { supabase, userId: data.user.id }
}

async function readSetup({ supabase }: Session): Promise<CashSetup> {
  const [account, settings] = await Promise.all([
    readGoogleAccount(),
    supabase.schema('synapse').from('settings').select('cash_sheet_id').maybeSingle(),
  ])
  if (settings.error) throw settings.error
  if (!account) return { status: 'google-disconnected' }
  if (account.needsReauth) return { status: 'google-reauth' }
  if (!account.scopes.includes(SCOPE_DRIVE_FILE)) return { status: 'needs-scope' }
  const sheetId = settings.data?.cash_sheet_id as string | null | undefined
  return sheetId ? { status: 'ready', sheetId } : { status: 'no-sheet', googleEmail: account.email }
}

/** Refresh token chiffré de l'utilisateur, lu par `synapse.google_refresh_token()` (sa ligne seulement). */
async function readCipher({ supabase }: Session) {
  const { data, error } = await supabase.schema('synapse').rpc('google_refresh_token')
  if (error) throw error
  return (data as string | null) ?? null
}

/** Jeton d'accès frais. Illisible ou refusé par Google : `CashError` « reauth ». */
async function accessToken(cipher: string | null) {
  const refreshToken = cipher && (await decryptToken(cipher))
  if (!refreshToken) throw new CashError(401, 'Reconnecte Google pour accéder au fichier.', 'reauth')
  try {
    return await refreshAccessToken(refreshToken)
  } catch (e) {
    if (e instanceof GoogleReauthError) throw new CashError(401, 'Reconnecte Google pour accéder au fichier.', 'reauth')
    throw e
  }
}

/** Erreurs Google traduites ; « reauth » pose aussi le bandeau « Reconnecter Google ». */
async function translate(e: unknown, { supabase }: Session): Promise<never> {
  if (e instanceof SheetsError) {
    if (e.status === 401) e = new CashError(401, 'Reconnecte Google pour accéder au fichier.', 'reauth')
    else if (e.status === 403 || e.status === 404) {
      throw new CashError(
        409,
        'Synapse n’a pas accès à ce fichier (supprimé, ou accès retiré) : choisis-le à nouveau dans les réglages.',
      )
    } else if (e.status === 400) {
      throw new CashError(409, 'Le fichier n’a pas le format attendu (onglets Saisies et Catégories).')
    }
  }
  if (e instanceof CashError && e.code === 'reauth') {
    const { error } = await supabase.schema('synapse').rpc('flag_google_reauth')
    if (error) console.error('[cash] needs_reauth', error)
  }
  throw e
}

/** Session, fichier prêt et jeton frais, pour une écriture (jamais en cache). */
async function withSheet<T>(fn: (ctx: Session & { token: string; sheetId: string }) => Promise<T>): Promise<T> {
  const s = await session()
  const setup = await readSetup(s)
  if (setup.status !== 'ready') throw new CashError(409, 'Choisis d’abord le fichier des dépenses dans les réglages.')
  try {
    const token = await accessToken(await readCipher(s))
    return await fn({ ...s, token, sheetId: setup.sheetId })
  } catch (e) {
    return translate(e, s)
  }
}

// Lecture -------------------------------------------------------------------------

export type CashBook = {
  title: string
  entries: CashEntry[]
  categories: string[]
  /** Lignes de `Saisies` illisibles (date ou montant invalide), hors totaux. */
  unreadable: number[]
  fetchedAt: string
}

export type CashRead =
  | Exclude<CashSetup, { status: 'ready' }>
  | { status: 'needs-migration'; sheetId: string; title: string }
  | { status: 'ok'; sheetId: string; book: CashBook }

/**
 * Lecture de `Saisies` et `Catégories` en un `values:batchGet`. Les lignes
 * ajoutées à la main sans ID reçoivent un UUID, écrit en un seul
 * `values:batchUpdate` : la ligne garde le même ID d'une lecture à l'autre.
 */
async function fetchBook(
  token: string,
  sheetId: string,
): Promise<{ status: 'needs-migration'; title: string } | { status: 'ok'; book: CashBook }> {
  const spreadsheet = await getSpreadsheet(token, sheetId)
  const titles = spreadsheet.sheets.map((s) => s.title)
  if (!titles.includes(ENTRIES_SHEET)) return { status: 'needs-migration', title: spreadsheet.title }

  const ranges = [range(ENTRIES_SHEET, 'A2:E')]
  if (titles.includes(CATEGORIES_SHEET)) ranges.push(range(CATEGORIES_SHEET, 'A2:A'))
  const [rows, categoryRows = []] = await batchGetValues(token, sheetId, ranges)
  const parsed = parseEntries(rows)

  if (parsed.missingIds.length) {
    await batchUpdateValues(
      token,
      sheetId,
      parsed.missingIds.map(({ row, id }) => ({ range: range(ENTRIES_SHEET, `A${row}`), values: [[id]] })),
    )
  }

  return {
    status: 'ok',
    book: {
      title: spreadsheet.title,
      entries: sortByDateDesc(parsed.entries),
      categories: parseCategories(categoryRows),
      unreadable: parsed.unreadable,
      fetchedAt: new Date().toISOString(),
    },
  }
}

/** État et contenu du fichier, depuis le cache Next (quelques minutes) ou Google. */
export async function readCash(): Promise<CashRead> {
  const s = await session()
  const setup = await readSetup(s)
  if (setup.status !== 'ready') return setup

  // Le jeton chiffré est lu hors du cache (il passe par les cookies de session).
  const cipher = await readCipher(s)
  const cached = unstable_cache(
    async () => fetchBook(await accessToken(cipher), setup.sheetId),
    ['cash-book', s.userId, setup.sheetId],
    { revalidate: CACHE_SECONDS, tags: [cashTag(s.userId)] },
  )
  try {
    const result = await cached()
    return result.status === 'ok'
      ? { status: 'ok', sheetId: setup.sheetId, book: result.book }
      : { status: 'needs-migration', sheetId: setup.sheetId, title: result.title }
  } catch (e) {
    return translate(e, s)
  }
}

/** Dépenses d'un mois (AAAA-MM), plus récente d'abord. */
export function entriesOfMonth(book: CashBook, month: string) {
  return book.entries.filter((e) => e.date.startsWith(`${month}-`))
}

export type CashWidgetData =
  | Exclude<CashRead, { status: 'ok' }>
  | { status: 'error' }
  | { status: 'ok'; month: string; monthTotal: number; recent: CashEntry[]; categories: string[]; unreadable: number }

export const cashConnector: Connector<CashWidgetData> = {
  id: 'cash',
  async read() {
    let cash: CashRead
    try {
      cash = await readCash()
    } catch (e) {
      // Fichier inaccessible, jeton refusé… : le message dit quoi faire.
      if (e instanceof CashError) return { data: { status: 'error' }, syncedAt: null, error: e.message }
      throw e
    }
    if (cash.status !== 'ok') return { data: cash, syncedAt: null }
    const month = dayKey(new Date()).slice(0, 7)
    return {
      data: {
        status: 'ok',
        month,
        monthTotal: sumAmounts(entriesOfMonth(cash.book, month)),
        recent: cash.book.entries.slice(0, RECENT_COUNT),
        categories: cash.book.categories,
        unreadable: cash.book.unreadable.length,
      },
      syncedAt: new Date(cash.book.fetchedAt),
    }
  },
}

// Écritures -----------------------------------------------------------------------

/** Catégories relues sans cache : la validation suit l'onglet tel qu'il est. */
async function freshCategories(token: string, sheetId: string) {
  return parseCategories(await getValues(token, sheetId, range(CATEGORIES_SHEET, 'A2:A')))
}

/** Ligne (1-indexée) de la dépense, cherchée par ID : la feuille a pu bouger depuis l'affichage. */
async function findRow(token: string, sheetId: string, id: string) {
  const ids = await getValues(token, sheetId, range(ENTRIES_SHEET, 'A2:A'))
  const index = ids.findIndex(([cell]) => typeof cell === 'string' && cell.trim().toLowerCase() === id.toLowerCase())
  if (index < 0) throw new CashError(404, 'Cette dépense n’existe plus.', 'gone')
  return index + 2
}

function done(userId: string) {
  revalidateTag(cashTag(userId))
}

export async function createEntry(raw: unknown) {
  return withSheet(async ({ token, sheetId, userId }) => {
    const result = validateEntry(raw, await freshCategories(token, sheetId))
    if (!result.entry) throw new CashError(400, result.error)
    const id = crypto.randomUUID()
    await appendValues(token, sheetId, range(ENTRIES_SHEET, 'A:E'), [entryToRow(id, result.entry)])
    done(userId)
    return { id, ...result.entry } satisfies CashEntry
  })
}

export async function updateEntry(id: string, raw: unknown) {
  if (!isUuid(id)) throw new CashError(404, 'Cette dépense n’existe plus.', 'gone')
  return withSheet(async ({ token, sheetId, userId }) => {
    const result = validateEntry(raw, await freshCategories(token, sheetId))
    if (!result.entry) throw new CashError(400, result.error)
    const row = await findRow(token, sheetId, id)
    await updateValues(token, sheetId, range(ENTRIES_SHEET, `A${row}:E${row}`), [entryToRow(id, result.entry)])
    done(userId)
    return { id, ...result.entry } satisfies CashEntry
  })
}

export async function deleteEntry(id: string) {
  if (!isUuid(id)) throw new CashError(404, 'Cette dépense n’existe plus.', 'gone')
  return withSheet(async ({ token, sheetId, userId }) => {
    const [spreadsheet, row] = await Promise.all([getSpreadsheet(token, sheetId), findRow(token, sheetId, id)])
    const tab = spreadsheet.sheets.find((s) => s.title === ENTRIES_SHEET)
    if (!tab) throw new CashError(409, 'Onglet Saisies introuvable.')
    await batchUpdate(token, sheetId, [
      { deleteDimension: { range: { sheetId: tab.sheetId, dimension: 'ROWS', startIndex: row - 1, endIndex: row } } },
    ])
    done(userId)
  })
}

/** Nouvelle catégorie, ajoutée en bas de l'onglet `Catégories` (donc à la liste déroulante de la feuille). */
export async function addCategory(raw: unknown) {
  return withSheet(async ({ token, sheetId, userId }) => {
    const result = validateCategory(raw, await freshCategories(token, sheetId))
    if (result.error !== undefined) throw new CashError(400, result.error)
    if (!result.existing) {
      await appendValues(token, sheetId, range(CATEGORIES_SHEET, 'A:A'), [[result.name]])
      done(userId)
    }
    return result.name
  })
}

// Fichier ----------------------------------------------------------------------------

const SHEET_ID = /^[A-Za-z0-9_-]{20,100}$/

/** Fichier choisi dans le Picker : vérifié avec le jeton du serveur avant d'être enregistré. */
export async function linkSheet(sheetId: unknown) {
  if (typeof sheetId !== 'string' || !SHEET_ID.test(sheetId)) throw new CashError(400, 'Fichier invalide.')
  const s = await session()
  const setup = await readSetup(s)
  if (setup.status !== 'ready' && setup.status !== 'no-sheet') throw new CashError(409, 'Reconnecte Google d’abord.')

  let title: string
  try {
    title = (await getSpreadsheet(await accessToken(await readCipher(s)), sheetId)).title
  } catch (e) {
    return translate(e, s)
  }

  const { error } = await s.supabase
    .schema('synapse')
    .from('settings')
    .upsert({ user_id: s.userId, cash_sheet_id: sheetId }, { onConflict: 'user_id' })
  if (error) {
    console.error('[cash] enregistrement du fichier', error)
    throw new CashError(500, 'Enregistrement impossible, réessaie.')
  }
  done(s.userId)
  return { title }
}

/** Oublie le fichier. L'accès accordé via le Picker reste chez Google, le fichier n'est pas touché. */
export async function unlinkSheet() {
  const s = await session()
  const { error } = await s.supabase.schema('synapse').from('settings').update({ cash_sheet_id: null }).eq('user_id', s.userId)
  if (error) {
    console.error('[cash] oubli du fichier', error)
    throw new CashError(500, 'Enregistrement impossible, réessaie.')
  }
  done(s.userId)
}

// Migration --------------------------------------------------------------------------

export type MigrationPreview =
  | { status: 'already-migrated' }
  | { status: 'error'; message: string }
  | { status: 'ready'; title: string; sourceTitle: string; plan: MigrationPlan }

/** Onglet source et plan de migration. Rien n'est écrit. */
async function readSource(token: string, sheetId: string) {
  const spreadsheet = await getSpreadsheet(token, sheetId)
  if (spreadsheet.sheets.some((s) => s.title === ENTRIES_SHEET)) return { spreadsheet, status: 'already-migrated' as const }

  const source =
    spreadsheet.sheets.find((s) => s.sheetId === SOURCE_GID) ?? spreadsheet.sheets.find((s) => s.title === SOURCE_TITLE)
  if (!source) return { spreadsheet, status: 'error' as const, message: `Onglet source « ${SOURCE_TITLE} » introuvable.` }

  const taken = spreadsheet.sheets.find((s) => s.title === CATEGORIES_SHEET || s.title === RECAP_SHEET)
  if (taken) {
    return {
      spreadsheet,
      status: 'error' as const,
      message: `Un onglet « ${taken.title} » existe déjà : renomme-le ou supprime-le, puis relance la migration.`,
    }
  }

  const plan = planMigration(await getValues(token, sheetId, range(source.title, SOURCE_RANGE)))
  if ('error' in plan) return { spreadsheet, status: 'error' as const, message: plan.error }
  return { spreadsheet, status: 'ready' as const, source, plan }
}

export async function previewMigration(): Promise<MigrationPreview> {
  return withSheet(async ({ token, sheetId }) => {
    const read = await readSource(token, sheetId)
    if (read.status === 'already-migrated') return { status: 'already-migrated' }
    if (read.status === 'error') return { status: 'error', message: read.message }
    return { status: 'ready', title: read.spreadsheet.title, sourceTitle: read.source.title, plan: read.plan }
  })
}

export type MigrationReport = {
  status: 'migrated' | 'already-migrated'
  source?: { count: number; total: number; declaredTotal: number | null; excluded: number }
  migrated?: { count: number; total: number }
}

/**
 * Migration en un seul `batchUpdate`, après validation des corrections. Relancée
 * alors que `Saisies` existe : ne crée rien. Le contrôle final relit `Saisies`.
 */
export async function runMigration(corrections: Record<string, Correction>): Promise<MigrationReport | { errors: { row: number; message: string }[] }> {
  return withSheet(async ({ token, sheetId, userId }) => {
    const read = await readSource(token, sheetId)
    if (read.status === 'already-migrated') return { status: 'already-migrated' }
    if (read.status === 'error') throw new CashError(409, read.message)

    const { entries, categories, excluded, errors } = applyCorrections(read.plan, corrections)
    if (errors.length) return { errors }

    const ids = freeSheetIds(read.spreadsheet.sheets.map((s) => s.sheetId), 3) as [number, number, number]
    const rows = entries.map((e) => ({ id: crypto.randomUUID(), ...e }))
    await batchUpdate(token, sheetId, migrationRequests({ sheetIds: ids, entries: rows, categories }))
    done(userId)

    const written = parseEntries(await getValues(token, sheetId, range(ENTRIES_SHEET, 'A2:E')))
    return {
      status: 'migrated',
      source: {
        count: read.plan.rows.length,
        total: read.plan.total,
        declaredTotal: read.plan.declaredTotal,
        excluded,
      },
      migrated: { count: written.entries.length, total: sumAmounts(written.entries) },
    }
  })
}
