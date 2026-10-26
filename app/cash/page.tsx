import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { formatChf, isMonthKey, monthLabel, shiftMonth, sumAmounts, totalsByCategory } from '@/lib/cash'
import { CashError, entriesOfMonth, readCash, type CashRead } from '@/lib/connectors/cash'
import { pickerConfig } from '@/lib/google/oauth'
import { dayKey, TIME_ZONE } from '@/lib/time'
import { CashSetup } from '@/components/cash/CashSetup'
import { EntryRow } from '@/components/cash/EntryRow'
import { QuickAdd } from '@/components/cash/QuickAdd'
import { card, muted } from '@/components/recipes/ui'

export default async function CashPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) redirect('/login')

  const today = dayKey(new Date())
  const params = await searchParams
  const month = params.month && isMonthKey(params.month) ? params.month : today.slice(0, 7)

  let cash: CashRead | null = null
  let error: string | null = null
  try {
    cash = await readCash()
  } catch (e) {
    if (!(e instanceof CashError)) console.error('[cash] lecture', e)
    error = e instanceof CashError ? e.message : 'Google Sheets ne répond pas, réessaie plus tard.'
  }

  const entries = cash?.status === 'ok' ? entriesOfMonth(cash.book, month) : []
  const byCategory = totalsByCategory(entries)

  return (
    <main className="mx-auto max-w-xl px-4 py-6">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold uppercase tracking-wider">Dépenses cash</h1>
        <Link href="/" className={`text-sm underline ${muted}`}>
          Retour au dashboard
        </Link>
      </header>

      {error && (
        <p role="alert" className="mb-4 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      {cash && cash.status !== 'ok' && (
        <section className={card}>
          <CashSetup cash={cash} picker={pickerConfig()} />
        </section>
      )}

      {cash?.status === 'ok' && (
        <>
          <nav aria-label="Mois" className="mb-4 flex items-center justify-between gap-3">
            <Link href={`/cash?month=${shiftMonth(month, -1)}`} className={`text-sm underline ${muted}`}>
              ← Mois précédent
            </Link>
            <h2 className="text-lg font-semibold">{monthLabel(month)}</h2>
            <Link href={`/cash?month=${shiftMonth(month, 1)}`} className={`text-sm underline ${muted}`}>
              Mois suivant →
            </Link>
          </nav>

          <section className={card}>
            <p className="flex items-baseline justify-between">
              <span className="font-semibold">Total</span>
              <span className="text-xl font-semibold tabular-nums">{formatChf(sumAmounts(entries))}</span>
            </p>
            {byCategory.length > 0 && (
              <ul aria-label="Total par catégorie" className="flex flex-col gap-1 text-sm">
                {byCategory.map(({ category, total }) => (
                  <li key={category} className="flex justify-between gap-3">
                    <span className="min-w-0 break-words">{category}</span>
                    <span className="shrink-0 tabular-nums">{formatChf(total)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className={`${card} mt-4`}>
            <h2 className="font-semibold">Ajouter une dépense</h2>
            <QuickAdd
              idPrefix="cash-page"
              categories={cash.book.categories}
              // Un autre mois affiché : la date proposée est le 1er de ce mois.
              today={month === today.slice(0, 7) ? today : `${month}-01`}
            />
          </section>

          <section className={`${card} mt-4`}>
            <h2 className="font-semibold">
              {entries.length} dépense{entries.length > 1 ? 's' : ''}
            </h2>
            {entries.length === 0 ? (
              <p className={`text-sm ${muted}`}>Aucune dépense ce mois-ci.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-slate-200 dark:divide-slate-800">
                {entries.map((entry) => (
                  <EntryRow key={entry.id} entry={entry} categories={cash.book.categories} />
                ))}
              </ul>
            )}
            {cash.book.unreadable.length > 0 && (
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Lignes illisibles dans l’onglet Saisies (date ou montant invalide), hors totaux :{' '}
                {cash.book.unreadable.join(', ')}.
              </p>
            )}
          </section>

          <p className={`mt-4 text-xs ${muted}`}>
            Source : «{' '}
            <a
              href={`https://docs.google.com/spreadsheets/d/${encodeURIComponent(cash.sheetId)}/edit`}
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              {cash.book.title}
            </a>{' '}
            », modifiable à la main. Lu le{' '}
            {new Date(cash.book.fetchedAt).toLocaleString('fr-FR', { timeZone: TIME_ZONE, dateStyle: 'short', timeStyle: 'short' })}
            , rechargé après chaque modification.
          </p>
        </>
      )}
    </main>
  )
}
