'use client'

import { createContext, useState, useTransition, type ReactNode } from 'react'
import { setChecklistItemDone } from '@/app/actions/cairn'
import { Spinner } from '@/components/ui/Spinner'

/** Permet à ItemText de signaler le texte affiché (optimiste) pour que la case garde le bon nom accessible. */
export const ItemLabelContext = createContext<(text: string) => void>(() => {})

/** Case à cocher d'un item Cairn : barré tout de suite, retiré au rafraîchissement. */
export function CheckItem({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  const [done, setDone] = useState(false)
  const [shownLabel, setShownLabel] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function toggle(next: boolean) {
    setDone(next)
    setError(null)
    startTransition(async () => {
      const result = await setChecklistItemDone(id, next)
      if (result.error) {
        setDone(!next)
        setError(result.error)
      }
    })
  }

  return (
    <li className="flex flex-col gap-0.5">
      <div className="flex items-start gap-2">
        <input
          id={`item-${id}`}
          type="checkbox"
          checked={done}
          disabled={pending}
          onChange={(e) => toggle(e.target.checked)}
          aria-label={shownLabel ?? label}
          className="mt-0.5 h-4 w-4 shrink-0 accent-slate-900 dark:accent-slate-100"
        />
        <div className={`min-w-0 flex-1 text-sm ${done ? 'text-slate-400 line-through' : ''}`}>
          <ItemLabelContext.Provider value={setShownLabel}>{children}</ItemLabelContext.Provider>
        </div>
        {pending && <Spinner size="sm" label="Enregistrement…" />}
      </div>
      {error && (
        <p role="alert" className="pl-6 text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </li>
  )
}
