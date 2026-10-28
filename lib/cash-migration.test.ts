import { describe, it, expect } from 'vitest'
import { CATEGORIES_SHEET, ENTRIES_SHEET, RECAP_SHEET, entryToRow, toSerial, type CashEntry } from '@/lib/cash'
import {
  RECAP_FORMULAS,
  applyCorrections,
  freeSheetIds,
  isAnomaly,
  migrationRequests,
  planMigration,
  type MigrationPlan,
  type SourceRow,
} from '@/lib/cash-migration'

const HEADER = ['Date', 'Mois', 'Catégorie', 'Montant (CHF)', 'Remarque']

/** Onglet source type : titre, en-tête, lignes mêlant numéros de série et texte, TOTAL, date invalide, puis du bruit. */
const GRID: unknown[][] = [
  ['Dépenses Liquide 2026'], // ligne 1
  HEADER, // ligne 2
  [toSerial('2026-10-01'), 'Octobre', 'Marché ', 12.5, 'pain'], // ligne 3
  ['02.10.2026', 'Octobre', 'Café', '3,50', ''], // ligne 4
  ['24.20.2026', 'Octobre', 'Café', 7, 'date fausse'], // ligne 5
  [toSerial('2026-10-25'), 'Octobre', 'Transport', 20, null], // ligne 6
  ['TOTAL 2026', '', '', 43, ''], // ligne 7
  [], // ligne 8 : vide, la lecture s'arrête ici
  ['bruit', 'après', 'la fin', 99, 'ignoré'], // ligne 9
]

function plan(cells: unknown[][] = GRID): MigrationPlan {
  const result = planMigration(cells)
  if ('error' in result) throw new Error(result.error)
  return result
}

/** En-tête puis les lignes données, pour les cas ciblés. */
const withHeader = (...rows: unknown[][]) => [HEADER, ...rows]

const base: SourceRow = {
  row: 1,
  rawDate: '01.10.2026',
  date: '2026-10-01',
  suggestion: null,
  rawAmount: '5',
  amount: 5,
  category: 'Café',
  trimmed: false,
  note: null,
}

describe('isAnomaly', () => {
  it('laisse passer une ligne lisible', () => {
    expect(isAnomaly(base)).toBe(false)
  })

  it.each([
    ['date illisible', { date: null }],
    ['montant illisible', { amount: null }],
    ['montant nul', { amount: 0 }],
    ['montant négatif', { amount: -2 }],
    ['catégorie vide', { category: '' }],
  ])('signale : %s', (_name, over) => {
    expect(isAnomaly({ ...base, ...over })).toBe(true)
  })
})

describe('planMigration', () => {
  it('signale un en-tête introuvable', () => {
    const result = planMigration([['a', 'b'], ['c']])
    expect(result).toEqual({ error: expect.stringContaining('En-tête') })
  })

  it('signale une colonne Catégorie absente', () => {
    const result = planMigration([['Date', 'Montant'], ['01.10.2026', 5]])
    expect(result).toEqual({ error: expect.stringContaining('Catégorie') })
  })

  it('retrouve l’en-tête sous une ligne de titre, sans tenir compte des accents ni de la casse', () => {
    const result = plan([['Titre'], ['DATE', 'mois', 'CATÉGORIE', 'MONTANT (chf)', 'REMARQUE'], ['01.10.2026', '', 'Café', 5, 'x']])
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0]).toMatchObject({ row: 3, date: '2026-10-01', category: 'Café', amount: 5, note: 'x' })
  })

  it('s’arrête à la première ligne vide', () => {
    const result = plan()
    expect(result.rows.map((r) => r.row)).toEqual([3, 4, 5, 6])
    expect(result.rows.some((r) => r.category === 'bruit' || r.note === 'ignoré')).toBe(false)
  })

  it('numérote les lignes comme la feuille, à partir de 1', () => {
    expect(plan().rows.map((r) => r.row)).toEqual([3, 4, 5, 6])
  })

  it('saute la ligne TOTAL et garde sa valeur pour le contrôle', () => {
    const result = plan()
    expect(result.declaredTotal).toBe(43)
    expect(result.rows.some((r) => r.rawDate.startsWith('TOTAL'))).toBe(false)
  })

  it('n’a pas de total déclaré sans ligne TOTAL', () => {
    expect(plan(withHeader(['01.10.2026', '', 'Café', 5, ''])).declaredTotal).toBeNull()
  })

  it('lit dates en numéro de série ou en texte, montants en nombre ou en texte', () => {
    const rows = plan().rows
    expect(rows[0]).toMatchObject({ rawDate: '01.10.2026', date: '2026-10-01', rawAmount: '12.5', amount: 12.5, note: 'pain' })
    expect(rows[1]).toMatchObject({ rawDate: '02.10.2026', date: '2026-10-02', rawAmount: '3,50', amount: 3.5, note: null })
    expect(rows[3]).toMatchObject({ date: '2026-10-25', amount: 20, note: null })
  })

  it('nettoie la catégorie et signale les espaces retirés', () => {
    const [marche, cafe] = plan().rows
    expect(marche).toMatchObject({ category: 'Marché', trimmed: true })
    expect(cafe).toMatchObject({ category: 'Café', trimmed: false })
  })

  it('laisse une ligne à date invalide sans date et propose celle de la ligne valide voisine', () => {
    const bad = plan().rows[2]
    expect(bad).toMatchObject({ row: 5, rawDate: '24.20.2026', date: null, suggestion: '2026-10-24' })
  })

  it('propose le mois de la ligne d’après quand rien ne précède', () => {
    const result = plan(withHeader(['24.20.2026', '', 'Café', 1, ''], [toSerial('2026-12-03'), '', 'Café', 2, '']))
    expect(result.rows[0].suggestion).toBe('2026-12-24')
  })

  it('préfère la ligne valide d’avant à celle d’après', () => {
    const result = plan(
      withHeader([toSerial('2026-10-03'), '', 'Café', 1, ''], ['24.20.2026', '', 'Café', 2, ''], [toSerial('2026-12-03'), '', 'Café', 3, '']),
    )
    expect(result.rows[1].suggestion).toBe('2026-10-24')
  })

  it('ne propose rien quand le jour n’existe pas dans le mois voisin', () => {
    const result = plan(withHeader([toSerial('2026-11-05'), '', 'Café', 1, ''], ['31.13.2026', '', 'Café', 2, '']))
    expect(result.rows[1]).toMatchObject({ date: null, suggestion: null })
  })

  it('ne propose rien quand la date n’a pas la forme JJ.MM.AAAA, ou une autre année', () => {
    const result = plan(
      withHeader([toSerial('2025-11-05'), '', 'Café', 1, ''], ['24.20.2026', '', 'Café', 2, ''], ['pas une date', '', 'Café', 3, '']),
    )
    expect(result.rows[1].suggestion).toBeNull()
    expect(result.rows[2].suggestion).toBeNull()
  })

  it('trie les catégories en français, sans doublon ni vide', () => {
    const result = plan(withHeader(['01.10.2026', '', 'Transport', 1, ''], ['01.10.2026', '', 'Écharpe', 1, ''], ['01.10.2026', '', 'Café', 1, ''], ['01.10.2026', '', 'Café ', 1, ''], ['01.10.2026', '', '', 1, '']))
    expect(result.categories).toEqual(['Café', 'Écharpe', 'Transport'])
  })

  it('additionne seulement les lignes lisibles', () => {
    // 12.5 + 3.5 + 20 : la ligne à date invalide (7) n'y est pas.
    expect(plan().total).toBe(36)
  })
})

describe('applyCorrections', () => {
  it('bloque sur une anomalie sans correction', () => {
    const result = applyCorrections(plan(), {})
    expect(result.errors).toEqual([{ row: 5, message: 'Date invalide.' }])
    expect(result.entries).toHaveLength(3)
  })

  it('applique la date corrigée d’une anomalie', () => {
    const result = applyCorrections(plan(), { '5': { date: '2026-10-24' } })
    expect(result.errors).toEqual([])
    expect(result.entries.map((e) => [e.date, e.amount, e.category, e.note])).toEqual([
      ['2026-10-01', 12.5, 'Marché', 'pain'],
      ['2026-10-02', 3.5, 'Café', null],
      ['2026-10-24', 7, 'Café', 'date fausse'],
      ['2026-10-25', 20, 'Transport', null],
    ])
  })

  it('ne reprend jamais la date proposée d’office', () => {
    const result = applyCorrections(plan(), { '5': {} })
    expect(result.errors).toHaveLength(1)
  })

  it('exclut une ligne et la compte', () => {
    const result = applyCorrections(plan(), { '5': { excluded: true } })
    expect(result).toMatchObject({ excluded: 1, errors: [] })
    expect(result.entries).toHaveLength(3)
  })

  it('exclut aussi une ligne lisible', () => {
    const result = applyCorrections(plan(), { '3': { excluded: true }, '5': { excluded: true } })
    expect(result.excluded).toBe(2)
    expect(result.entries.map((e) => e.category)).toEqual(['Café', 'Transport'])
  })

  it('n’applique une correction qu’aux anomalies', () => {
    const result = applyCorrections(plan(), {
      '3': { date: '2026-01-01', amount: 999, category: 'Autre' },
      '5': { excluded: true },
    })
    expect(result.errors).toEqual([])
    expect(result.entries[0]).toEqual({ date: '2026-10-01', amount: 12.5, category: 'Marché', note: 'pain' })
  })

  it('accepte une catégorie nouvelle sur une anomalie', () => {
    const result = applyCorrections(plan(), { '5': { date: '2026-10-24', category: '  Divers  ' } })
    expect(result.errors).toEqual([])
    expect(result.entries[2].category).toBe('Divers')
    expect(result.categories).toContain('Divers')
  })

  it('corrige un montant illisible, en texte ou en nombre', () => {
    const source = plan(withHeader(['01.10.2026', '', 'Café', 'abc', ''], ['02.10.2026', '', 'Café', 'xyz', '']))
    const result = applyCorrections(source, { '2': { amount: '12,50' }, '3': { amount: 4 } })
    expect(result.errors).toEqual([])
    expect(result.entries.map((e) => e.amount)).toEqual([12.5, 4])
  })

  it('signale une correction invalide', () => {
    const result = applyCorrections(plan(), { '5': { date: '2026-02-30' } })
    expect(result.errors).toEqual([{ row: 5, message: 'Date invalide.' }])
  })

  it('rend les catégories des lignes gardées, triées et sans doublon', () => {
    const result = applyCorrections(plan(), { '5': { date: '2026-10-24' } })
    expect(result.categories).toEqual(['Café', 'Marché', 'Transport'])
  })

  it('ne garde pas la catégorie d’une ligne exclue', () => {
    const result = applyCorrections(plan(), { '6': { excluded: true }, '5': { date: '2026-10-24' } })
    expect(result.categories).toEqual(['Café', 'Marché'])
  })
})

describe('freeSheetIds', () => {
  it('rend `count` ids distincts, hors des ids existants', () => {
    const existing = [1_000_000_001]
    // 0.5 retombe sur l'id existant, 0.25 est tiré deux fois : seuls les tirages libres et nouveaux restent.
    const draws = [0.5, 0.25, 0.25, 0.75, 0.125]
    const ids = freeSheetIds(existing, 3, () => draws.shift() ?? 0.9)
    expect(ids).toEqual([500_000_001, 1_500_000_001, 250_000_001])
    expect(new Set(ids).size).toBe(3)
    expect(ids.some((id) => existing.includes(id))).toBe(false)
  })

  it('tire au hasard par défaut', () => {
    const ids = freeSheetIds([], 3)
    expect(new Set(ids).size).toBe(3)
    for (const id of ids) expect(id).toBeGreaterThanOrEqual(1)
  })
})

describe('migrationRequests', () => {
  type Req = {
    addSheet?: { properties: { sheetId: number; title: string; index: number; gridProperties: { rowCount: number } } }
    updateCells?: {
      start: { sheetId: number; rowIndex: number; columnIndex: number }
      rows: { values: { userEnteredValue: Record<string, unknown> }[] }[]
    }
  }

  const entry: CashEntry = { id: 'a', date: '2026-10-24', amount: 12.5, category: 'Café', note: null }
  const build = (entries: CashEntry[]) =>
    migrationRequests({ sheetIds: [11, 22, 33], entries, categories: ['Café', 'Marché'] }) as unknown as Req[]
  const entriesWrite = (requests: Req[]) =>
    requests.filter((r) => r.updateCells?.start.sheetId === 11 && r.updateCells.start.rowIndex === 1)

  it('commence par créer les trois onglets avec les ids donnés', () => {
    const requests = build([entry])
    expect(requests.slice(0, 3).map((r) => r.addSheet?.properties)).toMatchObject([
      { sheetId: 11, title: ENTRIES_SHEET, index: 0 },
      { sheetId: 22, title: CATEGORIES_SHEET, index: 1 },
      { sheetId: 33, title: RECAP_SHEET, index: 2 },
    ])
  })

  it('dimensionne Saisies à max(1000, lignes + 500)', () => {
    const many = Array.from({ length: 600 }, (_, i) => ({ ...entry, id: `id-${i}` }))
    expect(build([entry])[0].addSheet?.properties.gridProperties.rowCount).toBe(1000)
    expect(build([])[0].addSheet?.properties.gridProperties.rowCount).toBe(1000)
    expect(build(many)[0].addSheet?.properties.gridProperties.rowCount).toBe(1100)
  })

  it('écrit les catégories sous leur en-tête', () => {
    const write = build([entry]).find((r) => r.updateCells?.start.sheetId === 22)
    expect(write?.updateCells?.rows.map((row) => row.values[0].userEnteredValue)).toEqual([
      { stringValue: 'Catégorie' },
      { stringValue: 'Café' },
      { stringValue: 'Marché' },
    ])
  })

  it('pose les formules de Récap comme formules', () => {
    const formulas = build([entry])
      .flatMap((r) => r.updateCells?.rows ?? [])
      .flatMap((row) => row.values)
      .map((v) => v.userEnteredValue.formulaValue)
      .filter(Boolean)
    expect(formulas).toEqual([RECAP_FORMULAS.byCategory, RECAP_FORMULAS.byYear, RECAP_FORMULAS.byMonth])
  })

  it('écrit les lignes migrées en dernier, date en numéro de série', () => {
    const requests = build([entry, { ...entry, id: 'b', note: 'noir' }])
    const last = requests.at(-1)?.updateCells
    expect(last?.start).toEqual({ sheetId: 11, rowIndex: 1, columnIndex: 0 })
    const expected = [entryToRow('a', entry), entryToRow('b', { ...entry, note: 'noir' })]
    expect(last?.rows.map((row) => row.values.map((v) => Object.values(v.userEnteredValue)[0]))).toEqual(expected)
    expect(last?.rows[0].values[1].userEnteredValue).toEqual({ numberValue: toSerial('2026-10-24') })
  })

  it('n’ajoute pas d’écriture finale sans ligne à migrer', () => {
    const withEntries = build([entry])
    const without = build([])
    expect(entriesWrite(without)).toHaveLength(0)
    expect(entriesWrite(withEntries)).toHaveLength(1)
    expect(without).toHaveLength(withEntries.length - 1)
    expect(without.at(-1)?.updateCells).toBeUndefined()
  })
})
