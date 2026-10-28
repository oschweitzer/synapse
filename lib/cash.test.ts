import { describe, it, expect } from 'vitest'
import {
  AMOUNT_MAX,
  CATEGORY_MAX,
  NOTE_MAX,
  cellToAmount,
  cellToDay,
  entryToRow,
  findCategory,
  formatChf,
  formatDay,
  fromSerial,
  isMonthKey,
  isUuid,
  isValidDay,
  monthLabel,
  normalizeCategory,
  parseCategories,
  parseEntries,
  parseSwissDate,
  roundCents,
  shiftMonth,
  sortByDateDesc,
  sumAmounts,
  toSerial,
  totalsByCategory,
  validateCategory,
  validateEntry,
  type CashEntry,
} from '@/lib/cash'

const ID_1 = '11111111-1111-4111-8111-111111111111'
const ID_2 = '22222222-2222-4222-8222-222222222222'
const ID_3 = '33333333-3333-4333-8333-333333333333'

const entry = (over: Partial<CashEntry>): CashEntry => ({
  id: 'e',
  date: '2026-10-01',
  amount: 1,
  category: 'Marché',
  note: null,
  ...over,
})

describe('isUuid', () => {
  it('accepte un UUID, majuscules comprises', () => {
    expect(isUuid(ID_1)).toBe(true)
    expect(isUuid(ID_1.toUpperCase())).toBe(true)
  })

  it('refuse le reste', () => {
    expect(isUuid('')).toBe(false)
    expect(isUuid('pas-un-uuid')).toBe(false)
    expect(isUuid(`${ID_1}0`)).toBe(false)
  })
})

describe('isValidDay', () => {
  it('accepte un jour existant, 29 février des années bissextiles compris', () => {
    expect(isValidDay('2026-10-24')).toBe(true)
    expect(isValidDay('2024-02-29')).toBe(true)
  })

  it('refuse un jour inexistant', () => {
    expect(isValidDay('2026-04-31')).toBe(false)
    expect(isValidDay('2026-02-29')).toBe(false)
    expect(isValidDay('2026-13-01')).toBe(false)
  })

  it('limite les années à 1900..2999', () => {
    expect(isValidDay('1899-12-31')).toBe(false)
    expect(isValidDay('1900-01-01')).toBe(true)
    expect(isValidDay('2999-12-31')).toBe(true)
    expect(isValidDay('3000-01-01')).toBe(false)
  })

  it('exige le format AAAA-MM-JJ', () => {
    expect(isValidDay('2026-4-1')).toBe(false)
    expect(isValidDay('24.10.2026')).toBe(false)
    expect(isValidDay('')).toBe(false)
  })
})

describe('toSerial / fromSerial', () => {
  it('prend le 30 décembre 1899 pour jour 0', () => {
    expect(toSerial('1899-12-30')).toBe(0)
    expect(toSerial('1899-12-31')).toBe(1)
  })

  it('fait l’aller-retour', () => {
    for (const day of ['1900-01-01', '2024-02-29', '2026-10-24', '2999-12-31']) {
      expect(fromSerial(toSerial(day))).toBe(day)
    }
  })

  it('ignore l’heure d’un numéro de série', () => {
    const serial = toSerial('2025-01-02')
    expect(fromSerial(serial + 0.75)).toBe('2025-01-02')
  })
})

describe('parseSwissDate', () => {
  it('lit JJ.MM.AAAA, avec ou sans zéro de tête', () => {
    expect(parseSwissDate('05.03.2026')).toBe('2026-03-05')
    expect(parseSwissDate('5.3.2026')).toBe('2026-03-05')
    expect(parseSwissDate('  5.3.2026 ')).toBe('2026-03-05')
  })

  it('accepte « / » et « - » comme séparateurs', () => {
    expect(parseSwissDate('5/3/2026')).toBe('2026-03-05')
    expect(parseSwissDate('5-3-2026')).toBe('2026-03-05')
  })

  it('refuse une date inexistante sans la corriger', () => {
    expect(parseSwissDate('31.04.2026')).toBeNull()
    expect(parseSwissDate('24.20.2026')).toBeNull()
  })

  it('refuse tout autre texte', () => {
    expect(parseSwissDate('hier')).toBeNull()
    expect(parseSwissDate('2026-10-24')).toBeNull()
    expect(parseSwissDate('')).toBeNull()
  })
})

describe('cellToDay', () => {
  it('lit un numéro de série', () => {
    const serial = toSerial('2026-10-24')
    expect(cellToDay(serial)).toBe('2026-10-24')
    expect(cellToDay(serial + 0.5)).toBe('2026-10-24')
  })

  it('lit un texte JJ.MM.AAAA', () => {
    expect(cellToDay('24.10.2026')).toBe('2026-10-24')
  })

  it('lit un texte AAAA-MM-JJ, espaces retirés', () => {
    expect(cellToDay('2026-10-24')).toBe('2026-10-24')
    expect(cellToDay(' 2026-10-24 ')).toBe('2026-10-24')
  })

  it('refuse zéro, négatif, NaN, texte invalide et autres types', () => {
    expect(cellToDay(0)).toBeNull()
    expect(cellToDay(-3)).toBeNull()
    expect(cellToDay(Number.NaN)).toBeNull()
    expect(cellToDay(Infinity)).toBeNull()
    expect(cellToDay('31.04.2026')).toBeNull()
    expect(cellToDay('abc')).toBeNull()
    expect(cellToDay(null)).toBeNull()
    expect(cellToDay(undefined)).toBeNull()
    expect(cellToDay(true)).toBeNull()
  })
})

describe('cellToAmount', () => {
  it('garde un nombre', () => {
    expect(cellToAmount(12.5)).toBe(12.5)
    expect(cellToAmount(0)).toBe(0)
  })

  it('lit les textes usuels', () => {
    expect(cellToAmount('12,50')).toBe(12.5)
    expect(cellToAmount('12.50')).toBe(12.5)
    expect(cellToAmount('12.50 CHF')).toBe(12.5)
    expect(cellToAmount('12 chf')).toBe(12)
    expect(cellToAmount("1'200")).toBe(1200)
    expect(cellToAmount('1’200,5')).toBe(1200.5)
    expect(cellToAmount('-3')).toBe(-3)
  })

  it('refuse NaN, texte illisible et autres types', () => {
    expect(cellToAmount(Number.NaN)).toBeNull()
    expect(cellToAmount(Infinity)).toBeNull()
    expect(cellToAmount('abc')).toBeNull()
    expect(cellToAmount('12,5,3')).toBeNull()
    expect(cellToAmount('')).toBeNull()
    expect(cellToAmount(null)).toBeNull()
    expect(cellToAmount(undefined)).toBeNull()
    expect(cellToAmount(true)).toBeNull()
  })
})

describe('formatDay', () => {
  it('rend le format de la feuille', () => {
    expect(formatDay('2026-10-24')).toBe('24.10.2026')
  })
})

describe('isMonthKey', () => {
  it('accepte AAAA-MM', () => {
    expect(isMonthKey('2026-01')).toBe(true)
    expect(isMonthKey('2026-12')).toBe(true)
  })

  it('refuse le reste', () => {
    expect(isMonthKey('2026-00')).toBe(false)
    expect(isMonthKey('2026-13')).toBe(false)
    expect(isMonthKey('2026-1')).toBe(false)
    expect(isMonthKey('2026-10-01')).toBe(false)
    expect(isMonthKey('')).toBe(false)
  })
})

describe('shiftMonth', () => {
  it('change de mois dans l’année', () => {
    expect(shiftMonth('2026-10', 1)).toBe('2026-11')
    expect(shiftMonth('2026-10', -2)).toBe('2026-08')
    expect(shiftMonth('2026-10', 0)).toBe('2026-10')
  })

  it('passe les frontières d’année', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
    expect(shiftMonth('2026-06', 12)).toBe('2027-06')
  })
})

describe('monthLabel', () => {
  it('met le mois en français avec une majuscule', () => {
    expect(monthLabel('2026-10')).toBe('Octobre 2026')
    expect(monthLabel('2026-01')).toBe('Janvier 2026')
  })
})

describe('roundCents / formatChf / sumAmounts', () => {
  it('arrondit au centime', () => {
    expect(roundCents(0.1 + 0.2)).toBe(0.3)
    expect(roundCents(1.005 * 100)).toBe(100.5)
    expect(roundCents(12.349)).toBe(12.35)
  })

  // Le séparateur de milliers de fr-FR est une espace insécable fine : on reste sous 1000.
  it('formate en CHF, deux décimales au plus', () => {
    expect(formatChf(12.5)).toBe('12,5 CHF')
    expect(formatChf(0.123)).toBe('0,12 CHF')
    expect(formatChf(0)).toBe('0 CHF')
  })

  it('somme sans traîne de flottant', () => {
    expect(sumAmounts([{ amount: 0.1 }, { amount: 0.2 }])).toBe(0.3)
    expect(sumAmounts([])).toBe(0)
  })
})

describe('totalsByCategory', () => {
  it('trie par total décroissant, puis par nom', () => {
    const entries = [
      entry({ category: 'Transport', amount: 10 }),
      entry({ category: 'Marché', amount: 20 }),
      entry({ category: 'Café', amount: 10 }),
      entry({ category: 'Marché', amount: 5.1 }),
    ]
    expect(totalsByCategory(entries)).toEqual([
      { category: 'Marché', total: 25.1 },
      { category: 'Café', total: 10 },
      { category: 'Transport', total: 10 },
    ])
  })

  it('arrondit les totaux', () => {
    const entries = [entry({ amount: 0.1 }), entry({ amount: 0.2 })]
    expect(totalsByCategory(entries)).toEqual([{ category: 'Marché', total: 0.3 }])
  })
})

describe('sortByDateDesc', () => {
  it('met la date la plus récente d’abord, la dernière ligne d’abord à date égale', () => {
    const a = entry({ id: 'a', date: '2026-10-01' })
    const b = entry({ id: 'b', date: '2026-10-02' })
    const c = entry({ id: 'c', date: '2026-10-01' })
    expect(sortByDateDesc([a, b, c]).map((e) => e.id)).toEqual(['b', 'c', 'a'])
  })

  it('ne modifie pas la liste d’origine', () => {
    const list = [entry({ id: 'a', date: '2026-10-01' }), entry({ id: 'b', date: '2026-10-02' })]
    sortByDateDesc(list)
    expect(list.map((e) => e.id)).toEqual(['a', 'b'])
  })
})

describe('normalizeCategory / findCategory', () => {
  it('retire les espaces en trop', () => {
    expect(normalizeCategory('  Sport   club ')).toBe('Sport club')
  })

  it('retrouve la catégorie sans tenir compte de la casse, telle qu’écrite', () => {
    expect(findCategory(['Marché', 'Café'], 'MARCHÉ')).toBe('Marché')
    expect(findCategory(['Marché', 'Café'], '  café ')).toBe('Café')
  })

  it('rend null si la catégorie est inconnue', () => {
    expect(findCategory(['Marché'], 'Transport')).toBeNull()
    expect(findCategory([], 'Marché')).toBeNull()
  })
})

describe('validateEntry', () => {
  const categories = ['Marché', 'Café']
  const valid = { date: '2026-10-24', amount: 12.5, category: 'Marché', note: 'pain' }

  it('accepte une saisie valide', () => {
    expect(validateEntry(valid, categories)).toEqual({
      entry: { date: '2026-10-24', amount: 12.5, category: 'Marché', note: 'pain' },
    })
  })

  it('rend la catégorie telle que stockée et une remarque vide à null', () => {
    const result = validateEntry({ ...valid, category: ' marché ', note: '   ' }, categories)
    expect(result).toEqual({ entry: { date: '2026-10-24', amount: 12.5, category: 'Marché', note: null } })
  })

  it('accepte un montant en texte', () => {
    expect(validateEntry({ ...valid, amount: '12,50' }, categories).entry?.amount).toBe(12.5)
  })

  it('accepte une remarque de NOTE_MAX caractères', () => {
    expect(validateEntry({ ...valid, note: 'x'.repeat(NOTE_MAX) }, categories).entry).toBeDefined()
  })

  it.each([
    ['date absente', { ...valid, date: undefined }, 'Date invalide.'],
    ['date inexistante', { ...valid, date: '2026-04-31' }, 'Date invalide.'],
    ['date en nombre', { ...valid, date: 46319 }, 'Date invalide.'],
    ['montant nul', { ...valid, amount: 0 }, 'Le montant doit être supérieur à 0.'],
    ['montant négatif', { ...valid, amount: -5 }, 'Le montant doit être supérieur à 0.'],
    ['montant illisible', { ...valid, amount: 'abc' }, 'Le montant doit être supérieur à 0.'],
    ['montant NaN', { ...valid, amount: Number.NaN }, 'Le montant doit être supérieur à 0.'],
    ['montant trop élevé', { ...valid, amount: AMOUNT_MAX + 1 }, 'Montant trop élevé.'],
    ['trois décimales', { ...valid, amount: 1.234 }, 'Deux décimales au plus.'],
    ['catégorie inconnue', { ...valid, category: 'Transport' }, 'Catégorie inconnue.'],
    ['catégorie absente', { ...valid, category: undefined }, 'Catégorie inconnue.'],
    ['remarque trop longue', { ...valid, note: 'x'.repeat(NOTE_MAX + 1) }, `Remarque : ${NOTE_MAX} caractères au plus.`],
    ['saisie vide', null, 'Date invalide.'],
  ])('refuse : %s', (_name, raw, error) => {
    expect(validateEntry(raw, categories)).toEqual({ error })
  })

  it('accepte AMOUNT_MAX exactement', () => {
    expect(validateEntry({ ...valid, amount: AMOUNT_MAX }, categories).entry?.amount).toBe(AMOUNT_MAX)
  })
})

describe('validateCategory', () => {
  const categories = ['Marché', 'Café']

  it('refuse un nom vide ou qui n’est pas un texte', () => {
    expect(validateCategory('', categories)).toEqual({ error: 'Donne un nom à la catégorie.' })
    expect(validateCategory('   ', categories)).toEqual({ error: 'Donne un nom à la catégorie.' })
    expect(validateCategory(42, categories)).toEqual({ error: 'Donne un nom à la catégorie.' })
  })

  it('refuse un nom trop long', () => {
    expect(validateCategory('x'.repeat(CATEGORY_MAX + 1), categories)).toEqual({ error: `${CATEGORY_MAX} caractères au plus.` })
    expect(validateCategory('x'.repeat(CATEGORY_MAX), categories)).toMatchObject({ existing: false })
  })

  it.each(['=SOMME(A1)', '+1', '-1', '@mention'])('refuse un nom qui commence par %s', (name) => {
    expect(validateCategory(name, categories)).toEqual({ error: 'Le nom ne peut pas commencer par =, +, - ou @.' })
  })

  it('rend le nom stocké d’une catégorie existante', () => {
    expect(validateCategory('MARCHÉ', categories)).toEqual({ name: 'Marché', existing: true })
  })

  it('rend un nouveau nom normalisé', () => {
    expect(validateCategory('  Sport   club ', categories)).toEqual({ name: 'Sport club', existing: false })
  })
})

describe('entryToRow', () => {
  it('écrit la date en numéro de série et une remarque vide en texte vide', () => {
    const date = '2026-10-24'
    expect(entryToRow(ID_1, { date, amount: 12.5, category: 'Marché', note: null })).toEqual([ID_1, toSerial(date), 12.5, 'Marché', ''])
    expect(entryToRow(ID_1, { date, amount: 3, category: 'Café', note: 'noir' })[4]).toBe('noir')
  })
})

describe('parseEntries', () => {
  const serial = toSerial('2026-10-24')

  function ids() {
    let n = 0
    return () => `new-${++n}`
  }

  it('lit une ligne complète', () => {
    const result = parseEntries([[ID_1, serial, 12.5, ' Marché ', 'pain']], ids())
    expect(result).toEqual({
      entries: [{ id: ID_1, date: '2026-10-24', amount: 12.5, category: 'Marché', note: 'pain' }],
      missingIds: [],
      unreadable: [],
    })
  })

  it('ignore les lignes vides', () => {
    const result = parseEntries([[], ['', null, undefined, '  '], [ID_1, serial, 5, 'Café']], ids())
    expect(result.entries).toHaveLength(1)
    expect(result.unreadable).toEqual([])
  })

  it('liste les lignes illisibles avec leur numéro dans la feuille, à partir de 2', () => {
    const result = parseEntries(
      [
        [ID_1, serial, 5, 'Café'], // ligne 2
        [ID_2, 'pas une date', 5, 'Café'], // ligne 3
        [ID_3, serial, 0, 'Café'], // ligne 4
        [ID_3, serial, 'abc', 'Café'], // ligne 5
        [ID_3, serial, 5, ''], // ligne 6
      ],
      ids(),
    )
    expect(result.entries.map((e) => e.id)).toEqual([ID_1])
    expect(result.unreadable).toEqual([3, 4, 5, 6])
    expect(result.missingIds).toEqual([])
  })

  it('donne un ID à une ligne qui n’en a pas ou dont l’ID n’est pas un UUID', () => {
    const result = parseEntries(
      [
        [null, serial, 5, 'Café'], // ligne 2
        ['abc', serial, 6, 'Café'], // ligne 3
      ],
      ids(),
    )
    expect(result.missingIds).toEqual([
      { row: 2, id: 'new-1' },
      { row: 3, id: 'new-2' },
    ])
    expect(result.entries.map((e) => e.id)).toEqual(['new-1', 'new-2'])
  })

  it('remplace un ID dupliqué, majuscules comprises, et garde le premier', () => {
    const result = parseEntries(
      [
        [ID_1, serial, 5, 'Café'], // ligne 2
        [ID_1, serial, 6, 'Café'], // ligne 3
        [ID_1.toUpperCase(), serial, 7, 'Café'], // ligne 4
      ],
      ids(),
    )
    expect(result.entries.map((e) => e.id)).toEqual([ID_1, 'new-1', 'new-2'])
    expect(result.missingIds).toEqual([
      { row: 3, id: 'new-1' },
      { row: 4, id: 'new-2' },
    ])
  })

  it('lit date en texte, montant en texte, et arrondit au centime', () => {
    const result = parseEntries([[ID_1, '24.10.2026', '12,50', 'Café', ''], [ID_2, serial, 0.1 + 0.2, 'Café']], ids())
    expect(result.entries.map((e) => [e.date, e.amount, e.note])).toEqual([
      ['2026-10-24', 12.5, null],
      ['2026-10-24', 0.3, null],
    ])
  })

  it('génère les ID avec crypto.randomUUID par défaut', () => {
    const result = parseEntries([[null, serial, 5, 'Café']])
    expect(isUuid(result.entries[0].id)).toBe(true)
    expect(result.missingIds).toEqual([{ row: 2, id: result.entries[0].id }])
  })
})

describe('parseCategories', () => {
  it('retire les vides et les doublons, casse ignorée', () => {
    expect(parseCategories([['Marché'], ['marché'], [''], [null], [], ['  Sport   club '], ['MARCHÉ']])).toEqual([
      'Marché',
      'Sport club',
    ])
  })

  it('rend une liste vide sans ligne', () => {
    expect(parseCategories([])).toEqual([])
  })
})
