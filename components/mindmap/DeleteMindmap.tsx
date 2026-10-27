'use client'

import { useFormStatus } from 'react-dom'
import { deleteMindmap } from '@/app/actions/mindmaps'
import { Button } from '@/components/ui/Button'

/** Bouton d'envoi à part : `useFormStatus` ne lit que le formulaire parent. */
function DeleteButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" variant="danger-quiet" size="sm" icon="trash" iconOnly loading={pending}>
      Supprimer
    </Button>
  )
}

export function DeleteMindmap({ id, title }: { id: string; title: string }) {
  return (
    <form
      action={deleteMindmap}
      onSubmit={(e) => {
        if (!window.confirm(`Supprimer la carte « ${title} » ? Cette action est définitive.`)) e.preventDefault()
      }}
    >
      <input type="hidden" name="id" value={id} />
      <DeleteButton />
    </form>
  )
}
