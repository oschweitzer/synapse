import Link from 'next/link'
import { formatChf, formatDay, monthLabel } from '@/lib/cash'
import type { CashWidgetData } from '@/lib/connectors/cash'
import { CashSetup, type PickerProps } from '@/components/cash/CashSetup'
import { QuickAdd } from '@/components/cash/QuickAdd'

const muted = 'text-slate-500 dark:text-slate-400'

/** Dépenses cash : ajout rapide, total du mois en cours, 5 dernières dépenses. */
export function CashWidget({ cash, picker, today }: { cash: CashWidgetData; picker: PickerProps; today: string }) {
  // `error` est rendu par WidgetSlot, sans passer par ici.
  if (cash.status === 'error') return null
  if (cash.status !== 'ok') return <CashSetup cash={cash} picker={picker} />

  return (
    <div className="flex flex-col gap-3">
      <p className="flex items-baseline justify-between gap-2">
        <span className={`text-sm ${muted}`}>{monthLabel(cash.month)}</span>
        <span className="text-xl font-semibold tabular-nums">{formatChf(cash.monthTotal)}</span>
      </p>
      <QuickAdd idPrefix="cash-widget" categories={cash.categories} today={today} />
      {cash.recent.length === 0 ? (
        <p className={`text-sm ${muted}`}>Aucune dépense saisie.</p>
      ) : (
        <ul aria-label="Dernières dépenses" className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800">
          {cash.recent.map((e) => (
            <li key={e.id} className="flex items-baseline gap-2 py-1.5 text-sm">
              <span className={`w-12 shrink-0 text-xs tabular-nums ${muted}`}>{formatDay(e.date).slice(0, 5)}</span>
              <span className="min-w-0 flex-1 truncate" title={e.note ?? undefined}>
                {e.category}
                {e.note && <span className={muted}> · {e.note}</span>}
              </span>
              <span className="shrink-0 tabular-nums">{formatChf(e.amount)}</span>
            </li>
          ))}
        </ul>
      )}
      {cash.unreadable > 0 && (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          {cash.unreadable} ligne{cash.unreadable > 1 ? 's' : ''} illisible{cash.unreadable > 1 ? 's' : ''} dans le
          fichier, hors totaux.
        </p>
      )}
      <Link href="/cash" className={`text-sm underline ${muted}`}>
        Toutes les dépenses
      </Link>
    </div>
  )
}
