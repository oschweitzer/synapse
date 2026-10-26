'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { cashApi } from './api'

/** Oublie le fichier des dépenses (le fichier lui-même n'est pas touché). */
export function UnlinkSheet() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await cashApi('/sheet', 'DELETE')
            if (!result.ok) return setError(result.error)
            router.refresh()
          })
        }
        className="rounded border border-slate-300 px-3 py-2 text-sm font-medium text-slate-900 disabled:opacity-60 dark:border-slate-700 dark:text-slate-100"
      >
        Oublier ce fichier
      </button>
      {error && (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  )
}
