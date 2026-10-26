/**
 * Dépenses cash : règles partagées par le serveur et le navigateur (aucun accès
 * réseau ici). Le Google Sheet est la source de vérité ; ces règles reprennent
 * celles de ses validations, pour refuser côté serveur ce que la feuille
 * refuserait.
 */

/** Onglets du fichier. `Saisies` : ligne 1 = en-tête, données dès la ligne 2. */
export const ENTRIES_SHEET = 'Saisies'
export const CATEGORIES_SHEET = 'Catégories'
export const RECAP_SHEET = 'Récap'
export const ENTRIES_HEADER = ['ID', 'Date', 'Montant', 'Catégorie', 'Remarque']

export const NOTE_MAX = 500
export const CATEGORY_MAX = 50
/** Garde-fou contre une faute de frappe (un zéro de trop), pas une règle de la feuille. */
export const AMOUNT_MAX = 1_000_000

export type CashEntry = {
  id: string
  /** AAAA-MM-JJ */
  date: string
  amount: number
  category: string
  note: string | null
}

export type CashEntryInput = Omit<CashEntry, 'id'>

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(value: string) {
  return UUID.test(value)
}

// Dates ----------------------------------------------------------------------------

const DAY_MS = 24 * 3600 * 1000
/** Jour 0 des numéros de série Sheets (et Excel) : 30 décembre 1899. */
const SERIAL_EPOCH = Date.UTC(1899, 11, 30)

/** AAAA-MM-JJ existant (pas de 31 avril), entre 1900 et 2999. */
export function isValidDay(day: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day)
  if (!match) return false
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const date = new Date(Date.UTC(y, m - 1, d))
  return y >= 1900 && y < 3000 && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
}

/** Jour → numéro de série Sheets, écrit tel quel (`RAW`) : indépendant de la locale du fichier. */
export function toSerial(day: string) {
  const [y, m, d] = day.split('-').map(Number)
  return Math.round((Date.UTC(y, m - 1, d) - SERIAL_EPOCH) / DAY_MS)
}

/** Numéro de série Sheets (heure éventuelle ignorée) → AAAA-MM-JJ. */
export function fromSerial(serial: number) {
  return new Date(SERIAL_EPOCH + Math.floor(serial) * DAY_MS).toISOString().slice(0, 10)
}

/** Date saisie à la main `JJ.MM.AAAA` (ou `/`, `-`) → AAAA-MM-JJ, sans la corriger. */
export function parseSwissDate(text: string) {
  const match = /^\s*(\d{1,2})[./-](\d{1,2})[./-](\d{4})\s*$/.exec(text)
  if (!match) return null
  const day = `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`
  return isValidDay(day) ? day : null
}

/** Cellule de date lue en `SERIAL_NUMBER` : un nombre, ou un texte si la saisie n'a pas été reconnue. */
export function cellToDay(cell: unknown) {
  if (typeof cell === 'number' && Number.isFinite(cell) && cell > 0) return fromSerial(cell)
  if (typeof cell === 'string') return parseSwissDate(cell) ?? (isValidDay(cell.trim()) ? cell.trim() : null)
  return null
}

/** Cellule de montant : un nombre, ou un texte « 12,50 », « 12.50 CHF ». */
export function cellToAmount(cell: unknown) {
  if (typeof cell === 'number') return Number.isFinite(cell) ? cell : null
  if (typeof cell !== 'string') return null
  const text = cell.replace(/chf/i, '').replace(/[\s  '’]/g, '').replace(',', '.')
  return /^-?\d+(\.\d+)?$/.test(text) ? Number(text) : null
}

/** AAAA-MM-JJ → `24.10.2026`, le format de la feuille. */
export function formatDay(day: string) {
  const [y, m, d] = day.split('-')
  return `${d}.${m}.${y}`
}

// Mois -----------------------------------------------------------------------------

/** AAAA-MM */
export function isMonthKey(value: string) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value)
}

export function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1 + delta, 1))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

export function monthLabel(month: string) {
  const label = new Date(`${month}-15T12:00:00Z`).toLocaleDateString('fr-FR', {
    timeZone: 'UTC',
    month: 'long',
    year: 'numeric',
  })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

// Montants -------------------------------------------------------------------------

/** Arrondi au centime, pour que les sommes de flottants ne traînent pas de 0,000001. */
export function roundCents(value: number) {
  return Math.round(value * 100) / 100
}

export function formatChf(value: number) {
  return `${value.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} CHF`
}

export function sumAmounts(entries: Pick<CashEntry, 'amount'>[]) {
  return roundCents(entries.reduce((sum, e) => sum + e.amount, 0))
}

/** Total par catégorie, du plus gros au plus petit. */
export function totalsByCategory(entries: CashEntry[]) {
  const totals = new Map<string, number>()
  for (const e of entries) totals.set(e.category, (totals.get(e.category) ?? 0) + e.amount)
  return [...totals.entries()]
    .map(([category, total]) => ({ category, total: roundCents(total) }))
    .sort((a, b) => b.total - a.total || a.category.localeCompare(b.category, 'fr'))
}

/** Plus récente d'abord ; à date égale, la dernière saisie (plus bas dans la feuille) d'abord. */
export function sortByDateDesc(entries: CashEntry[]) {
  return entries
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => b.entry.date.localeCompare(a.entry.date) || b.index - a.index)
    .map(({ entry }) => entry)
}

// Catégories -----------------------------------------------------------------------

export function normalizeCategory(name: string) {
  return name.trim().replace(/\s+/g, ' ')
}

/** La catégorie telle qu'écrite dans l'onglet `Catégories`, sans tenir compte de la casse. */
export function findCategory(categories: string[], name: string) {
  const wanted = normalizeCategory(name).toLocaleLowerCase('fr')
  return categories.find((c) => c.toLocaleLowerCase('fr') === wanted) ?? null
}

// Validation -----------------------------------------------------------------------

/**
 * Validation d'une saisie, identique à celle de la feuille : date valide,
 * montant > 0, catégorie connue. La catégorie est rendue telle qu'écrite dans
 * l'onglet `Catégories`, pour que la liste déroulante de la feuille l'accepte.
 */
export function validateEntry(
  raw: unknown,
  categories: string[],
): { entry: CashEntryInput; error?: never } | { error: string; entry?: never } {
  const input = (raw ?? {}) as Record<string, unknown>
  const date = typeof input.date === 'string' ? input.date.trim() : ''
  if (!isValidDay(date)) return { error: 'Date invalide.' }

  const amount = typeof input.amount === 'number' ? input.amount : cellToAmount(input.amount)
  if (amount === null || !Number.isFinite(amount) || amount <= 0) return { error: 'Le montant doit être supérieur à 0.' }
  if (amount > AMOUNT_MAX) return { error: 'Montant trop élevé.' }
  if (roundCents(amount) !== amount) return { error: 'Deux décimales au plus.' }

  const category = typeof input.category === 'string' ? findCategory(categories, input.category) : null
  if (!category) return { error: 'Catégorie inconnue.' }

  const note = typeof input.note === 'string' ? input.note.trim() : ''
  if (note.length > NOTE_MAX) return { error: `Remarque : ${NOTE_MAX} caractères au plus.` }

  return { entry: { date, amount, category, note: note || null } }
}

/** Nouvelle catégorie : non vide, sans doublon (casse ignorée). */
export function validateCategory(raw: unknown, categories: string[]) {
  const name = typeof raw === 'string' ? normalizeCategory(raw) : ''
  if (!name) return { error: 'Donne un nom à la catégorie.' }
  if (name.length > CATEGORY_MAX) return { error: `${CATEGORY_MAX} caractères au plus.` }
  // Une formule dans la feuille : `=`, `+`, `-`, `@` en tête seraient lus comme tels à la main.
  if (/^[=+\-@]/.test(name)) return { error: 'Le nom ne peut pas commencer par =, +, - ou @.' }
  const existing = findCategory(categories, name)
  return existing ? { name: existing, existing: true } : { name, existing: false }
}

// Lecture de l'onglet Saisies -------------------------------------------------------

/** Saisie → cellules A:E d'une ligne de `Saisies`. */
export function entryToRow(id: string, entry: CashEntryInput) {
  return [id, toSerial(entry.date), entry.amount, entry.category, entry.note ?? '']
}

export type ParsedEntries = {
  entries: CashEntry[]
  /** Lignes ajoutées à la main sans ID : numéro de ligne → ID à écrire. */
  missingIds: { row: number; id: string }[]
  /** Lignes non vides illisibles (date ou montant invalide) : laissées telles quelles, hors totaux. */
  unreadable: number[]
}

/**
 * Lit `Saisies!A2:E` (valeurs brutes). Une ligne sans ID reçoit un UUID, à
 * écrire par l'appelant ; une ligne illisible est signalée, jamais corrigée.
 */
export function parseEntries(rows: unknown[][], newId: () => string = () => crypto.randomUUID()): ParsedEntries {
  const entries: CashEntry[] = []
  const missingIds: ParsedEntries['missingIds'] = []
  const unreadable: number[] = []
  const seen = new Set<string>()

  rows.forEach((cells, index) => {
    const row = index + 2
    const [rawId, rawDate, rawAmount, rawCategory, rawNote] = cells
    const text = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim())
    if (cells.every((c) => text(c) === '')) return

    const date = cellToDay(rawDate)
    const amount = cellToAmount(rawAmount)
    const category = normalizeCategory(text(rawCategory))
    if (!date || amount === null || amount <= 0 || !category) {
      unreadable.push(row)
      return
    }

    // Un ID dupliqué (ligne copiée-collée à la main) est remplacé : sinon modifier l'une toucherait l'autre.
    let id = text(rawId)
    if (!isUuid(id) || seen.has(id.toLowerCase())) {
      id = newId()
      missingIds.push({ row, id })
    }
    seen.add(id.toLowerCase())

    entries.push({ id, date, amount: roundCents(amount), category, note: text(rawNote) || null })
  })

  return { entries, missingIds, unreadable }
}

/** Onglet `Catégories!A2:A` : une par ligne, sans vide ni doublon. */
export function parseCategories(rows: unknown[][]) {
  const categories: string[] = []
  for (const [cell] of rows) {
    const name = normalizeCategory(cell === null || cell === undefined ? '' : String(cell))
    if (name && !findCategory(categories, name)) categories.push(name)
  }
  return categories
}
