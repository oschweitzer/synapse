'use client'

import { useState, useTransition } from 'react'
import { CATEGORY_MAX, NOTE_MAX, type CashEntryInput } from '@/lib/cash'
import { cashApi } from './api'

const NEW_CATEGORY = '__new__'

const field =
  'min-w-0 rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100'

/**
 * Saisie d'une dépense : ajout rapide ou édition en ligne. « Nouvelle
 * catégorie… » l'ajoute d'abord à l'onglet `Catégories`, puis enregistre la dépense.
 */
export function EntryForm({
  idPrefix,
  categories,
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  idPrefix: string
  categories: string[]
  initial: Partial<CashEntryInput> & { date: string }
  submitLabel: string
  /** Rend un message d'erreur, ou `null` si c'est enregistré. */
  onSubmit: (entry: CashEntryInput) => Promise<string | null>
  onCancel?: () => void
}) {
  const [date, setDate] = useState(initial.date)
  const [amount, setAmount] = useState(initial.amount != null ? String(initial.amount) : '')
  const [category, setCategory] = useState(initial.category ?? categories[0] ?? NEW_CATEGORY)
  const [newCategory, setNewCategory] = useState('')
  const [note, setNote] = useState(initial.note ?? '')
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)
  const [pending, startTransition] = useTransition()
  const isNew = category === NEW_CATEGORY

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setMessage(null)
    startTransition(async () => {
      let name = category
      if (isNew) {
        const created = await cashApi<{ name: string }>('/categories', 'POST', { name: newCategory })
        if (!created.ok) return setMessage({ text: created.error, error: true })
        name = created.data.name
        setCategory(name)
        setNewCategory('')
      }
      const error = await onSubmit({ date, amount: Number(amount.replace(',', '.')), category: name, note: note || null })
      if (error) return setMessage({ text: error, error: true })
      if (!onCancel) {
        // Ajout rapide : on garde la date et la catégorie pour enchaîner les saisies.
        setAmount('')
        setNote('')
        setMessage({ text: 'Ajouté.', error: false })
      }
    })
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2">
        <label className="sr-only" htmlFor={`${idPrefix}-date`}>
          Date
        </label>
        <input
          id={`${idPrefix}-date`}
          type="date"
          required
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className={field}
        />
        <label className="sr-only" htmlFor={`${idPrefix}-amount`}>
          Montant en CHF
        </label>
        <input
          id={`${idPrefix}-amount`}
          inputMode="decimal"
          required
          pattern="\d+([.,]\d{1,2})?"
          title="Un montant supérieur à 0, deux décimales au plus"
          placeholder="Montant CHF"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className={field}
        />
        <label className="sr-only" htmlFor={`${idPrefix}-category`}>
          Catégorie
        </label>
        <select
          id={`${idPrefix}-category`}
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className={`${field} ${isNew ? '' : 'col-span-2'}`}
        >
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
          <option value={NEW_CATEGORY}>Nouvelle catégorie…</option>
        </select>
        {isNew && (
          <>
            <label className="sr-only" htmlFor={`${idPrefix}-new-category`}>
              Nom de la nouvelle catégorie
            </label>
            <input
              id={`${idPrefix}-new-category`}
              required
              maxLength={CATEGORY_MAX}
              placeholder="Nom"
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              className={field}
            />
          </>
        )}
        <label className="sr-only" htmlFor={`${idPrefix}-note`}>
          Remarque
        </label>
        <input
          id={`${idPrefix}-note`}
          maxLength={NOTE_MAX}
          placeholder="Remarque (facultatif)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className={`${field} col-span-2`}
        />
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="flex-1 rounded bg-slate-900 px-2 py-1 text-sm font-medium text-white disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900"
        >
          {pending ? 'Enregistrement…' : submitLabel}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="rounded border border-slate-300 px-2 py-1 text-sm font-medium disabled:opacity-60 dark:border-slate-700"
          >
            Annuler
          </button>
        )}
      </div>
      {message && (
        <p
          role={message.error ? 'alert' : 'status'}
          className={`text-xs ${message.error ? 'text-red-600 dark:text-red-400' : 'text-green-700 dark:text-green-400'}`}
        >
          {message.text}
        </p>
      )}
    </form>
  )
}
