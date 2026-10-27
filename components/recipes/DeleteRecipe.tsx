'use client'

import { deleteRecipe } from '@/app/actions/recipes'
import { SubmitButton } from '@/components/ui/SubmitButton'

/** Suppression après confirmation : la recette disparaît aussi de l'historique des repas. */
export function DeleteRecipe({ id, title }: { id: string; title: string }) {
  return (
    <form
      action={deleteRecipe}
      onSubmit={(e) => {
        if (!window.confirm(`Supprimer « ${title} » ?`)) e.preventDefault()
      }}
    >
      <input type="hidden" name="id" value={id} />
      <SubmitButton className="hud-btn hud-btn--danger">Supprimer</SubmitButton>
    </form>
  )
}
