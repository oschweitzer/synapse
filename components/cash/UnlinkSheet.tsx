'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { cashApi } from './api'

/** Oublie le fichier des dépenses (le fichier lui-même n'est pas touché). */
export function UnlinkSheet() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <div className="flex flex-col gap-1">
      <Button
        loading={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await cashApi('/sheet', 'DELETE')
            if (!result.ok) return setError(result.error)
            router.refresh()
          })
        }
      >
        Oublier ce fichier
      </Button>
      {error && (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  )
}
