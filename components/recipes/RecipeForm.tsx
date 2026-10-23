import Link from 'next/link'
import { saveRecipe } from '@/app/actions/recipes'
import type { RecipeRow } from '@/lib/connectors/meals'
import { card, input, muted, primaryButton } from './ui'

const ERRORS: Record<string, string> = {
  title: 'Le titre est obligatoire (200 caractères au plus).',
  'too-long': 'Trop de lignes ou une ligne trop longue (100 lignes au plus).',
  url: 'Le lien doit commencer par http:// ou https://.',
  save: 'Enregistrement impossible, réessaie.',
}

/** Saisie et édition d'une recette : une ligne par ingrédient, une ligne par étape. */
export function RecipeForm({
  recipe,
  error,
}: {
  recipe?: Pick<RecipeRow, 'id' | 'title' | 'ingredients' | 'steps' | 'source_url'>
  error?: string
}) {
  const message = error ? (ERRORS[error] ?? ERRORS.save) : null

  return (
    <form action={saveRecipe} className={card}>
      {recipe && <input type="hidden" name="id" value={recipe.id} />}
      <label className="flex flex-col gap-1 text-sm font-medium">
        Titre
        <input name="title" required maxLength={200} defaultValue={recipe?.title} className={`${input} font-normal`} />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Ingrédients
        <span className={`text-xs font-normal ${muted}`}>
          Un par ligne, quantité comprise : chaque ligne devient un item de la liste de courses.
        </span>
        <textarea
          name="ingredients"
          rows={8}
          defaultValue={recipe?.ingredients.join('\n')}
          className={`${input} font-normal`}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Étapes
        <span className={`text-xs font-normal ${muted}`}>Une par ligne.</span>
        <textarea name="steps" rows={10} defaultValue={recipe?.steps.join('\n')} className={`${input} font-normal`} />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Lien source (facultatif)
        <input
          name="source_url"
          type="url"
          placeholder="https://…"
          defaultValue={recipe?.source_url ?? ''}
          className={`${input} font-normal`}
        />
      </label>
      {message && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {message}
        </p>
      )}
      <div className="flex items-center gap-4">
        <button type="submit" className={primaryButton}>
          Enregistrer
        </button>
        <Link href={recipe ? `/recipes/${recipe.id}` : '/recipes'} className={`text-sm underline ${muted}`}>
          Annuler
        </Link>
      </div>
    </form>
  )
}
