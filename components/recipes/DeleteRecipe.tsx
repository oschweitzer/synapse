'use client'

import { deleteRecipe } from '@/app/actions/recipes'

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
      <button
        type="submit"
        className="rounded border border-red-300 px-3 py-2 font-medium text-red-700 dark:border-red-900 dark:text-red-400"
      >
        Supprimer
      </button>
    </form>
  )
}
