'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { formatChf, formatDay, type CashEntry } from '@/lib/cash'
import { cashApi } from './api'
import { EntryForm } from './EntryForm'

const muted = 'text-slate-500 dark:text-slate-400'

/** Une dépense de la vue « Dépenses » : édition en ligne, suppression après confirmation. */
export function EntryRow({ entry, categories }: { entry: CashEntry; categories: string[] }) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const label = `${formatDay(entry.date)}, ${entry.category}, ${formatChf(entry.amount)}`

  function remove() {
    if (!window.confirm(`Supprimer la dépense du ${label} ?`)) return
    setError(null)
    startTransition(async () => {
      const result = await cashApi(`/${entry.id}`, 'DELETE')
      if (!result.ok) return result.gone ? gone(result.error) : setError(result.error)
      router.refresh()
    })
  }

  /** Introuvable : supprimée entre-temps (dans la feuille ou ailleurs). La ligne disparaît au rechargement. */
  function gone(message: string) {
    window.alert(`${message} La liste va être rechargée.`)
    setEditing(false)
    router.refresh()
  }

  if (editing) {
    return (
      <li className="py-2">
        <EntryForm
          idPrefix={`edit-${entry.id}`}
          categories={categories.includes(entry.category) ? categories : [entry.category, ...categories]}
          initial={entry}
          submitLabel="Enregistrer"
          onCancel={() => setEditing(false)}
          onSubmit={async (next) => {
            const result = await cashApi<CashEntry>(`/${entry.id}`, 'PATCH', next)
            if (!result.ok && result.gone) {
              gone(result.error)
              return null
            }
            if (!result.ok) return result.error
            setEditing(false)
            router.refresh()
            return null
          }}
        />
      </li>
    )
  }

  return (
    <li className={`flex flex-col gap-1 py-2 ${pending ? 'opacity-60' : ''}`}>
      <div className="flex items-baseline gap-3 text-sm">
        <span className={`w-20 shrink-0 tabular-nums ${muted}`}>{formatDay(entry.date)}</span>
        <span className="min-w-0 flex-1 break-words">
          {entry.category}
          {entry.note && <span className={`block text-xs ${muted}`}>{entry.note}</span>}
        </span>
        <span className="shrink-0 font-medium tabular-nums">{formatChf(entry.amount)}</span>
      </div>
      <div className="flex justify-end gap-3 text-xs">
        <button type="button" onClick={() => setEditing(true)} disabled={pending} className={`underline ${muted}`}>
          Modifier<span className="sr-only"> la dépense du {label}</span>
        </button>
        <button type="button" onClick={remove} disabled={pending} className="text-red-700 underline dark:text-red-400">
          Supprimer<span className="sr-only"> la dépense du {label}</span>
        </button>
      </div>
      {error && (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </li>
  )
}
