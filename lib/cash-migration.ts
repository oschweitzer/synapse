/**
 * Migration unique du fichier « Dépenses Liquide » vers le format cible
 * (onglets `Saisies`, `Catégories`, `Récap`). Fonctions pures : lecture de
 * l'onglet source, anomalies à valider, requêtes du `batchUpdate`. Les appels à
 * Google sont dans `lib/connectors/cash.ts`.
 */

import {
  CATEGORIES_SHEET,
  cellToAmount,
  cellToDay,
  ENTRIES_HEADER,
  ENTRIES_SHEET,
  entryToRow,
  formatDay,
  fromSerial,
  isValidDay,
  normalizeCategory,
  RECAP_SHEET,
  roundCents,
  sumAmounts,
  validateEntry,
  type CashEntryInput,
} from './cash'

/** Onglet source : `2026`, retrouvé par son gid, sinon par son nom. */
export const SOURCE_GID = 634313310
export const SOURCE_TITLE = '2026'
/** Colonnes lues : A à F. Les récaps de G à J sont ignorés. */
export const SOURCE_RANGE = 'A1:F'

export type SourceRow = {
  /** Ligne dans l'onglet source (1-indexée). */
  row: number
  /** Date telle qu'affichée dans la source. */
  rawDate: string
  date: string | null
  /** Date proposée quand celle de la source est invalide, à valider. */
  suggestion: string | null
  rawAmount: string
  amount: number | null
  /** Catégorie nettoyée (`Marché ` → `Marché`). */
  category: string
  /** Espaces retirés de la catégorie. */
  trimmed: boolean
  note: string | null
}

export type MigrationPlan = {
  rows: SourceRow[]
  /** Catégories lisibles de la source, dans l'ordre alphabétique. */
  categories: string[]
  /** Somme des montants lisibles. */
  total: number
  /** Valeur de la ligne `TOTAL …` de la source, pour contrôle. */
  declaredTotal: number | null
}

/** Ligne à corriger avant l'écriture : date, montant ou catégorie inutilisable. */
export function isAnomaly(row: SourceRow) {
  return !row.date || row.amount === null || row.amount <= 0 || !row.category
}

const text = (cell: unknown) => (cell === null || cell === undefined ? '' : String(cell).trim())
const label = (cell: unknown) =>
  text(cell)
    .toLocaleLowerCase('fr')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')

/** Affichage d'une cellule de date : un numéro de série redevient `JJ.MM.AAAA`. */
function displayDate(cell: unknown) {
  return typeof cell === 'number' ? formatDay(fromSerial(cell)) : text(cell)
}

/**
 * Date invalide (`24.20.2026`) : on garde le jour et l'année, et on propose le
 * mois de la ligne valide la plus proche (avant, sinon après), puisque les
 * saisies sont chronologiques. Rien n'est appliqué sans validation.
 */
function suggestDate(raw: string, neighbours: (string | null)[]) {
  const match = /^\s*(\d{1,2})[./-](\d{1,2})[./-](\d{4})\s*$/.exec(raw)
  if (!match) return null
  const [day, year] = [match[1].padStart(2, '0'), match[3]]
  for (const neighbour of neighbours) {
    if (!neighbour || !neighbour.startsWith(`${year}-`)) continue
    const candidate = `${year}-${neighbour.slice(5, 7)}-${day}`
    if (isValidDay(candidate)) return candidate
  }
  return null
}

/**
 * Lit l'onglet source (valeurs brutes de A1:F) : en-tête
 * `Date | Mois | Catégorie | Montant (CHF) | Remarque`, puis les lignes de
 * données jusqu'à la première ligne vide. La ligne `TOTAL …` et la colonne
 * `Mois` (recalculée dans `Récap`) sont ignorées.
 */
export function planMigration(cells: unknown[][]): MigrationPlan | { error: string } {
  const headerIndex = cells.findIndex(
    (row) => row.some((c) => label(c) === 'date') && row.some((c) => label(c).startsWith('montant')),
  )
  if (headerIndex < 0) return { error: 'En-tête « Date | Mois | Catégorie | Montant (CHF) | Remarque » introuvable.' }

  const header = cells[headerIndex].map(label)
  const column = (test: (name: string) => boolean) => header.findIndex(test)
  const cols = {
    date: column((n) => n === 'date'),
    category: column((n) => n.startsWith('categorie')),
    amount: column((n) => n.startsWith('montant')),
    note: column((n) => n.startsWith('remarque')),
  }
  if (cols.category < 0) return { error: 'Colonne « Catégorie » introuvable dans l’en-tête.' }

  const rows: SourceRow[] = []
  let declaredTotal: number | null = null

  for (let i = headerIndex + 1; i < cells.length; i++) {
    const row = cells[i]
    const used = [cols.date, cols.category, cols.amount, cols.note].filter((c) => c >= 0)
    if (used.every((c) => text(row[c]) === '')) break

    // `TOTAL 2026` : on garde sa valeur pour le contrôle final, pas la ligne.
    if (row.some((c) => /^total\b/i.test(text(c)))) {
      declaredTotal = cellToAmount(row[cols.amount]) ?? declaredTotal
      continue
    }

    const rawCategory = row[cols.category] === null || row[cols.category] === undefined ? '' : String(row[cols.category])
    const category = normalizeCategory(rawCategory)
    const amount = cellToAmount(row[cols.amount])
    rows.push({
      row: i + 1,
      rawDate: displayDate(row[cols.date]),
      date: cellToDay(row[cols.date]),
      suggestion: null,
      rawAmount: text(row[cols.amount]),
      amount: amount === null ? null : roundCents(amount),
      category,
      trimmed: category !== '' && rawCategory !== category,
      note: cols.note >= 0 ? text(row[cols.note]) || null : null,
    })
  }

  // Après coup : la proposition s'appuie sur les lignes valides voisines.
  rows.forEach((r, i) => {
    if (r.date) return
    const before = rows.slice(0, i).reverse().map((n) => n.date)
    const after = rows.slice(i + 1).map((n) => n.date)
    r.suggestion = suggestDate(r.rawDate, [...before.filter(Boolean).slice(0, 1), ...after.filter(Boolean).slice(0, 1)])
  })

  const readable = rows.filter((r) => !isAnomaly(r))
  const categories = [...new Set(rows.map((r) => r.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr'))
  return { rows, categories, total: sumAmounts(readable as { amount: number }[]), declaredTotal }
}

/** Correction validée dans l'aperçu, par ligne source. */
export type Correction = { date?: string; amount?: number | string; category?: string; excluded?: boolean }

/**
 * Applique les corrections validées. Une anomalie sans correction bloque la
 * migration : la date proposée n'est jamais reprise d'office.
 */
export function applyCorrections(plan: MigrationPlan, corrections: Record<string, Correction>) {
  const entries: CashEntryInput[] = []
  const errors: { row: number; message: string }[] = []
  let excluded = 0

  for (const row of plan.rows) {
    const fix = corrections[String(row.row)] ?? {}
    if (fix.excluded) {
      excluded++
      continue
    }
    // Seules les anomalies se corrigent ici : le reste se modifie ensuite depuis Synapse ou la feuille.
    const anomaly = isAnomaly(row)
    const fixedCategory = typeof fix.category === 'string' ? normalizeCategory(fix.category) : ''
    const candidate = {
      date: (anomaly && typeof fix.date === 'string' && fix.date) || row.date || '',
      amount: (anomaly && fix.amount) || row.amount,
      category: (anomaly && fixedCategory) || row.category,
      note: row.note,
    }
    const categories = [...plan.categories, ...(candidate.category ? [candidate.category] : [])]
    const result = validateEntry(candidate, categories)
    if (!result.entry) errors.push({ row: row.row, message: result.error })
    else entries.push(result.entry)
  }

  const categories = [...new Set(entries.map((e) => e.category))].sort((a, b) => a.localeCompare(b, 'fr'))
  return { entries, categories, excluded, errors }
}

// Requêtes du batchUpdate ---------------------------------------------------------

type Value = string | number | { formula: string }

function cell(value: Value) {
  if (typeof value === 'number') return { userEnteredValue: { numberValue: value } }
  if (typeof value === 'string') return { userEnteredValue: { stringValue: value } }
  return { userEnteredValue: { formulaValue: value.formula } }
}

function updateCells(sheetId: number, rowIndex: number, columnIndex: number, rows: Value[][]) {
  return {
    updateCells: {
      start: { sheetId, rowIndex, columnIndex },
      rows: rows.map((values) => ({ values: values.map(cell) })),
      fields: 'userEnteredValue',
    },
  }
}

function bold(sheetId: number, rowIndex: number) {
  return {
    repeatCell: {
      range: { sheetId, startRowIndex: rowIndex, endRowIndex: rowIndex + 1 },
      cell: { userEnteredFormat: { textFormat: { bold: true } } },
      fields: 'userEnteredFormat.textFormat.bold',
    },
  }
}

/** Format de colonne, de la ligne 2 jusqu'en bas (plage ouverte). */
function columnFormat(sheetId: number, start: number, end: number, numberFormat: { type: string; pattern: string }) {
  return {
    repeatCell: {
      range: { sheetId, startRowIndex: 1, startColumnIndex: start, endColumnIndex: end },
      cell: { userEnteredFormat: { numberFormat } },
      fields: 'userEnteredFormat.numberFormat',
    },
  }
}

function validation(sheetId: number, column: number, condition: unknown, inputMessage: string, showCustomUi = false) {
  return {
    setDataValidation: {
      range: { sheetId, startRowIndex: 1, startColumnIndex: column, endColumnIndex: column + 1 },
      rule: { condition, strict: true, showCustomUi, inputMessage },
    },
  }
}

/** Format d'affichage des montants : `,` est le séparateur de milliers de la locale du fichier. */
const CHF = { type: 'NUMBER', pattern: '#,##0 "CHF"' }
const DATE = { type: 'DATE', pattern: 'dd.mm.yyyy' }

/**
 * Formules de `Récap`, qui lisent `Saisies` en entier : insensibles aux ajouts
 * et suppressions. Écrites en syntaxe anglaise (séparateur `,`), celle de l'API
 * quelle que soit la locale du fichier.
 */
export const RECAP_FORMULAS = {
  byCategory:
    "=QUERY(Saisies!C2:D, \"select D, sum(C) where C is not null group by D order by sum(C) desc label D 'Catégorie', sum(C) 'Total'\", 0)",
  byYear:
    "=QUERY(Saisies!B2:C, \"select year(B), sum(C) where B is not null group by year(B) order by year(B) label year(B) 'Année', sum(C) 'Total'\", 0)",
  byMonth:
    "=QUERY(Saisies!B2:D, \"select year(B), month(B)+1, sum(C) where B is not null group by year(B), month(B)+1 pivot D label year(B) 'Année', month(B)+1 'Mois'\", 0)",
}

/** Ids d'onglets libres : choisis ici pour que les requêtes suivantes du lot puissent les viser. */
export function freeSheetIds(existing: number[], count: number, random = () => Math.random()) {
  const ids: number[] = []
  while (ids.length < count) {
    const id = 1 + Math.floor(random() * 2_000_000_000)
    if (!existing.includes(id) && !ids.includes(id)) ids.push(id)
  }
  return ids
}

/**
 * Tout le format cible en un seul `spreadsheets.batchUpdate` : les trois
 * onglets, en-têtes, validations, formats, colonne ID masquée, puis les lignes
 * migrées (un UUID chacune). L'onglet source n'est pas touché.
 */
export function migrationRequests(params: {
  sheetIds: [number, number, number]
  entries: (CashEntryInput & { id: string })[]
  categories: string[]
}) {
  const [entriesId, categoriesId, recapId] = params.sheetIds
  const rowCount = Math.max(1000, params.entries.length + 500)

  return [
    {
      addSheet: {
        properties: {
          sheetId: entriesId,
          title: ENTRIES_SHEET,
          index: 0,
          gridProperties: { rowCount, columnCount: 5, frozenRowCount: 1 },
        },
      },
    },
    {
      addSheet: {
        properties: {
          sheetId: categoriesId,
          title: CATEGORIES_SHEET,
          index: 1,
          gridProperties: { rowCount: 200, columnCount: 1, frozenRowCount: 1 },
        },
      },
    },
    {
      addSheet: {
        properties: { sheetId: recapId, title: RECAP_SHEET, index: 2, gridProperties: { rowCount: 200, columnCount: 40 } },
      },
    },

    // Saisies : en-tête, formats, validations identiques à celles du serveur.
    updateCells(entriesId, 0, 0, [ENTRIES_HEADER]),
    bold(entriesId, 0),
    columnFormat(entriesId, 1, 2, DATE),
    columnFormat(entriesId, 2, 3, CHF),
    validation(entriesId, 1, { type: 'DATE_IS_VALID' }, 'Une date valide (jj.mm.aaaa).'),
    validation(entriesId, 2, { type: 'NUMBER_GREATER', values: [{ userEnteredValue: '0' }] }, 'Un montant supérieur à 0.'),
    validation(
      entriesId,
      3,
      { type: 'ONE_OF_RANGE', values: [{ userEnteredValue: `='${CATEGORIES_SHEET}'!A2:A` }] },
      'Une catégorie de l’onglet Catégories.',
      true,
    ),
    {
      updateDimensionProperties: {
        range: { sheetId: entriesId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 },
        properties: { hiddenByUser: true },
        fields: 'hiddenByUser',
      },
    },

    // Catégories : une par ligne, sous un en-tête.
    updateCells(categoriesId, 0, 0, [['Catégorie'], ...params.categories.map((c) => [c])]),
    bold(categoriesId, 0),

    // Récap : trois tableaux côte à côte, chacun s'étend vers le bas (le croisé, aussi vers la droite).
    updateCells(recapId, 0, 0, [['Total par catégorie', '', '', 'Total par année', '', '', 'Par mois et catégorie']]),
    bold(recapId, 0),
    updateCells(recapId, 1, 0, [[{ formula: RECAP_FORMULAS.byCategory }]]),
    updateCells(recapId, 1, 3, [[{ formula: RECAP_FORMULAS.byYear }]]),
    updateCells(recapId, 1, 6, [[{ formula: RECAP_FORMULAS.byMonth }]]),
    columnFormat(recapId, 1, 2, CHF),
    columnFormat(recapId, 4, 5, CHF),
    columnFormat(recapId, 8, 40, CHF),

    // Les lignes migrées, en dernier : dates en numéro de série, montants en nombre.
    ...(params.entries.length
      ? [
          updateCells(
            entriesId,
            1,
            0,
            params.entries.map((e) => entryToRow(e.id, e)),
          ),
        ]
      : []),
  ]
}
