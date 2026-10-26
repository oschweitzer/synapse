import type { NextRequest } from 'next/server'
import { isMonthKey, sumAmounts, totalsByCategory } from '@/lib/cash'
import { CashError, createEntry, entriesOfMonth, readCash } from '@/lib/connectors/cash'
import { dayKey } from '@/lib/time'
import { respond } from './respond'

/** Dépenses d'un mois (`?month=AAAA-MM`, par défaut le mois en cours), plus récente d'abord. */
export async function GET(request: NextRequest) {
  return respond(request, async () => {
    const month = request.nextUrl.searchParams.get('month') ?? dayKey(new Date()).slice(0, 7)
    if (!isMonthKey(month)) throw new CashError(400, 'Mois invalide (AAAA-MM).')
    const cash = await readCash()
    if (cash.status !== 'ok') throw new CashError(409, 'Fichier des dépenses non prêt.')
    const entries = entriesOfMonth(cash.book, month)
    return {
      month,
      entries,
      total: sumAmounts(entries),
      byCategory: totalsByCategory(entries),
      categories: cash.book.categories,
    }
  })
}

/** Nouvelle dépense `{ date, amount, category, note }`, ajoutée en bas de `Saisies`. */
export async function POST(request: NextRequest) {
  return respond(request, (body) => createEntry(body))
}
