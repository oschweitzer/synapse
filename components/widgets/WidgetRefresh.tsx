'use client'

import { useState, useTransition } from 'react'
import { refreshWidget } from '@/app/actions/dashboard'
import { Button } from '@/components/ui/Button'
import type { WidgetId } from '@/lib/dashboard'

/** Bouton d'en-tête : relit un seul widget ; l'ancien contenu reste affiché pendant le chargement. */
export function WidgetRefresh({ id, title }: { id: WidgetId; title: string }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function refresh() {
    setError(null)
    startTransition(async () => {
      const result = await refreshWidget(id).catch(() => ({ error: 'Actualisation impossible.' }))
      if (result.error) setError(result.error)
    })
  }

  return (
    <>
      {error && (
        <span role="alert" className="text-danger">
          {error}
        </span>
      )}
      <Button variant="quiet" size="sm" icon="sync" iconOnly loading={pending} onClick={refresh}>
        {`Actualiser « ${title} »`}
      </Button>
    </>
  )
}
