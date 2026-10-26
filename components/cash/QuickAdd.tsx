'use client'

import { useRouter } from 'next/navigation'
import type { CashEntry } from '@/lib/cash'
import { cashApi } from './api'
import { EntryForm } from './EntryForm'

/** Ajout rapide d'une dépense, puis rechargement des listes et totaux. */
export function QuickAdd({ idPrefix, categories, today }: { idPrefix: string; categories: string[]; today: string }) {
  const router = useRouter()
  return (
    <EntryForm
      idPrefix={idPrefix}
      categories={categories}
      initial={{ date: today }}
      submitLabel="Ajouter"
      onSubmit={async (entry) => {
        const result = await cashApi<CashEntry>('', 'POST', entry)
        if (!result.ok) return result.error
        router.refresh()
        return null
      }}
    />
  )
}
