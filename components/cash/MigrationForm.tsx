'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { formatChf, formatDay, roundCents } from '@/lib/cash'
import { isAnomaly, type Correction, type MigrationPlan, type SourceRow } from '@/lib/cash-migration'
import type { MigrationReport } from '@/lib/connectors/cash'
import { Button } from '@/components/ui/Button'
import { cashApi } from './api'

const muted = 'text-slate-500 dark:text-slate-400'
const field =
  'hud-input hud-input--sm min-w-0'

type Choice = { action: 'fix' | 'exclude' | null; date: string; amount: string; category: string }

function initialChoice(row: SourceRow): Choice {
  return {
    action: null,
    date: row.date ?? row.suggestion ?? '',
    amount: row.amount !== null && row.amount > 0 ? String(row.amount) : '',
    category: row.category,
  }
}

function problems(row: SourceRow) {
  const list: string[] = []
  if (!row.date) list.push(`date « ${row.rawDate || 'vide'} » invalide`)
  if (row.amount === null || row.amount <= 0) list.push(`montant « ${row.rawAmount || 'vide'} » invalide`)
  if (!row.category) list.push('catégorie vide')
  return list.join(', ')
}

/**
 * Aperçu de la migration : chaque anomalie est corrigée (proposition
 * pré-remplie) ou exclue explicitement, rien n'est écrit avant « Migrer ».
 */
export function MigrationForm({ plan }: { plan: MigrationPlan }) {
  const anomalies = plan.rows.filter(isAnomaly)
  const [choices, setChoices] = useState<Record<number, Choice>>(() =>
    Object.fromEntries(anomalies.map((row) => [row.row, initialChoice(row)])),
  )
  const [errors, setErrors] = useState<Record<number, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [report, setReport] = useState<MigrationReport | null>(null)
  const [pending, startTransition] = useTransition()
  const undecided = anomalies.filter((row) => !choices[row.row].action).length

  function update(row: number, patch: Partial<Choice>) {
    setChoices((current) => ({ ...current, [row]: { ...current[row], ...patch } }))
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setErrors({})
    const corrections: Record<string, Correction> = {}
    for (const row of anomalies) {
      const choice = choices[row.row]
      corrections[row.row] =
        choice.action === 'exclude'
          ? { excluded: true }
          : { date: choice.date, amount: choice.amount.replace(',', '.'), category: choice.category }
    }
    startTransition(async () => {
      const result = await cashApi<MigrationReport | { errors: { row: number; message: string }[] }>(
        '/migration',
        'POST',
        { corrections },
      )
      if (!result.ok) return setError(result.error)
      if ('errors' in result.data) {
        setErrors(Object.fromEntries(result.data.errors.map((e) => [e.row, e.message])))
        return setError('Certaines lignes ne passent pas la validation : corrige-les ou exclus-les.')
      }
      setReport(result.data)
    })
  }

  if (report) return <Report report={report} />

  const cleaned = plan.rows.filter((r) => r.trimmed).length

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <ul className={`list-disc pl-5 text-sm ${muted}`}>
        <li>
          {plan.rows.length} ligne{plan.rows.length > 1 ? 's' : ''} lue{plan.rows.length > 1 ? 's' : ''}, total des
          montants lisibles : {formatChf(plan.total)}
          {plan.declaredTotal !== null && <> (ligne TOTAL de la source : {formatChf(plan.declaredTotal)})</>}.
        </li>
        <li>Catégories : {plan.categories.join(', ') || 'aucune'}.</li>
        {cleaned > 0 && (
          <li>
            {cleaned} catégorie{cleaned > 1 ? 's' : ''} débarrassée{cleaned > 1 ? 's' : ''} d’espaces en trop.
          </li>
        )}
        <li>La colonne Mois est abandonnée (recalculée dans Récap) ; l’onglet source reste intact, en archive.</li>
      </ul>

      {anomalies.length > 0 && (
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-2 font-semibold">
            {anomalies.length} ligne{anomalies.length > 1 ? 's' : ''} à valider
          </legend>
          {anomalies.map((row) => {
            const choice = choices[row.row]
            const id = `row-${row.row}`
            return (
              <div key={row.row} className="flex flex-col gap-2 border border-amber-400 p-3">
                <p className="text-sm">
                  <span className="font-medium">Ligne {row.row}</span> : {problems(row)}.
                  {row.suggestion && <> Proposition : {formatDay(row.suggestion)}.</>}
                  <span className={`block text-xs ${muted}`}>
                    {[row.category, row.rawAmount && `${row.rawAmount} CHF`, row.note].filter(Boolean).join(' · ')}
                  </span>
                </p>
                <div className="grid grid-cols-3 gap-2">
                  <label className="sr-only" htmlFor={`${id}-date`}>
                    Date, ligne {row.row}
                  </label>
                  <input
                    id={`${id}-date`}
                    type="date"
                    value={choice.date}
                    onChange={(e) => update(row.row, { date: e.target.value, action: 'fix' })}
                    className={field}
                  />
                  <label className="sr-only" htmlFor={`${id}-amount`}>
                    Montant, ligne {row.row}
                  </label>
                  <input
                    id={`${id}-amount`}
                    inputMode="decimal"
                    placeholder="Montant"
                    value={choice.amount}
                    onChange={(e) => update(row.row, { amount: e.target.value, action: 'fix' })}
                    className={field}
                  />
                  <label className="sr-only" htmlFor={`${id}-category`}>
                    Catégorie, ligne {row.row}
                  </label>
                  <input
                    id={`${id}-category`}
                    list="migration-categories"
                    placeholder="Catégorie"
                    value={choice.category}
                    onChange={(e) => update(row.row, { category: e.target.value, action: 'fix' })}
                    className={field}
                  />
                </div>
                <div className="flex flex-wrap gap-4 text-sm" role="radiogroup" aria-label={`Ligne ${row.row}`}>
                  <label className="flex items-center gap-1.5">
                    <input
                      type="radio"
                      name={`${id}-action`}
                      checked={choice.action === 'fix'}
                      onChange={() => update(row.row, { action: 'fix' })}
                    />
                    Valider la correction
                  </label>
                  <label className="flex items-center gap-1.5">
                    <input
                      type="radio"
                      name={`${id}-action`}
                      checked={choice.action === 'exclude'}
                      onChange={() => update(row.row, { action: 'exclude' })}
                    />
                    Ne pas migrer cette ligne
                  </label>
                </div>
                {errors[row.row] && (
                  <p role="alert" className="text-xs text-red-600 dark:text-red-400">
                    {errors[row.row]}
                  </p>
                )}
              </div>
            )
          })}
          <datalist id="migration-categories">
            {plan.categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </fieldset>
      )}

      <details className="text-sm">
        <summary className="cursor-pointer font-medium">Toutes les lignes lues</summary>
        <ul className="mt-2 flex flex-col gap-0.5 tabular-nums">
          {plan.rows.map((row) => (
            <li key={row.row} className={isAnomaly(row) ? 'text-amber-700 dark:text-amber-400' : ''}>
              {row.row}. {row.date ? formatDay(row.date) : row.rawDate} · {row.category || '—'} ·{' '}
              {row.amount !== null ? formatChf(roundCents(row.amount)) : row.rawAmount || '—'}
              {row.note && <span className={muted}> · {row.note}</span>}
            </li>
          ))}
        </ul>
      </details>

      <Button type="submit" variant="primary" loading={pending} disabled={undecided > 0}>
        {pending ? 'Migration en cours…' : 'Migrer le fichier'}
      </Button>
      {undecided > 0 && (
        <p className={`text-xs ${muted}`}>
          Encore {undecided} ligne{undecided > 1 ? 's' : ''} à valider ou exclure.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </form>
  )
}

/** Contrôle final : ce qui a été relu dans `Saisies`, face à la source. */
function Report({ report }: { report: MigrationReport }) {
  if (report.status === 'already-migrated' || !report.source || !report.migrated) {
    return (
      <p role="status" className="text-sm">
        L’onglet Saisies existe déjà : rien n’a été créé.{' '}
        <Link href="/cash" className="underline">
          Voir les dépenses
        </Link>
      </p>
    )
  }

  const { source, migrated } = report
  const expectedCount = source.count - source.excluded
  const reference = source.declaredTotal ?? source.total
  const countOk = migrated.count === expectedCount
  const totalOk = migrated.total === reference

  return (
    <div role="status" className="flex flex-col gap-2 text-sm">
      <p className="font-semibold text-green-700 dark:text-green-400">Migration terminée.</p>
      <table className="w-full text-left tabular-nums">
        <thead>
          <tr className={muted}>
            <th className="font-normal"></th>
            <th className="font-normal">Source</th>
            <th className="font-normal">Saisies</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th className="font-medium">Lignes</th>
            <td>
              {source.count}
              {source.excluded > 0 && <> − {source.excluded} exclue{source.excluded > 1 ? 's' : ''}</>}
            </td>
            <td className={countOk ? '' : 'text-red-600 dark:text-red-400'}>
              {migrated.count} {countOk ? '✓' : '✗'}
            </td>
          </tr>
          <tr>
            <th className="font-medium">Total</th>
            <td>
              {formatChf(reference)}
              {source.declaredTotal !== null && <span className={`text-xs ${muted}`}> (ligne TOTAL)</span>}
            </td>
            <td className={totalOk ? '' : 'text-amber-700 dark:text-amber-400'}>
              {formatChf(migrated.total)} {totalOk ? '✓' : '≠'}
            </td>
          </tr>
        </tbody>
      </table>
      {!totalOk && (
        <p className={`text-xs ${muted}`}>
          Un écart vient d’un montant corrigé ou d’une ligne exclue ; sinon, compare les deux onglets.
        </p>
      )}
      <p>
        Contrôle aussi l’onglet Récap dans la feuille (formules).{' '}
        <Link href="/cash" className="underline">
          Voir les dépenses
        </Link>
      </p>
    </div>
  )
}
