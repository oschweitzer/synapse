'use client'

import { deleteMindmap } from '@/app/actions/mindmaps'
import { Button } from '@/components/ui/Button'

export function DeleteMindmap({ id, title }: { id: string; title: string }) {
  return (
    <form
      action={deleteMindmap}
      onSubmit={(e) => {
        if (!window.confirm(`Supprimer la carte « ${title} » ? Cette action est définitive.`)) e.preventDefault()
      }}
    >
      <input type="hidden" name="id" value={id} />
      <Button type="submit" variant="danger-quiet" size="sm" icon="trash" iconOnly>
        Supprimer
      </Button>
    </form>
  )
}
