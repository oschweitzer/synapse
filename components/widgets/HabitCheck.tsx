'use client'

import { useState, useTransition } from 'react'
import { setHabitDone } from '@/app/actions/mood'
import { Spinner } from '@/components/ui/Spinner'

/** Case « fait aujourd'hui » d'une habitude : cochée tout de suite, annulée si l'écriture échoue. */
export function HabitCheck({ id, name, done }: { id: string; name: string; done: boolean }) {
  const [checked, setChecked] = useState(done)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function toggle(next: boolean) {
    setChecked(next)
    setError(null)
    startTransition(async () => {
      const result = await setHabitDone(id, next)
      if (result.error) {
        setChecked(!next)
        setError(result.error)
      }
    })
  }

  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={checked}
          disabled={pending}
          onChange={(e) => toggle(e.target.checked)}
          className="h-4 w-4 shrink-0 accent-slate-900 dark:accent-slate-100"
        />
        <span className="truncate">{name}</span>
        {pending && <Spinner size="sm" label="Enregistrement…" />}
      </label>
      {error && (
        <p role="alert" className="pl-6 text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  )
}
