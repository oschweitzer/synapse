import Link from 'next/link'
import type { DailyRecipe } from '@/lib/connectors/meals'
import { AddToShopping } from '@/components/recipes/AddToShopping'
import { muted, secondaryButton } from '@/components/recipes/ui'

/** Ingrédients montrés dans le widget, le reste est sur la fiche. */
const INGREDIENT_LIMIT = 8

export function DailyRecipeWidget({ daily }: { daily: DailyRecipe }) {
  if (daily.status === 'empty') {
    return (
      <p className={`text-sm ${muted}`}>
        Aucune recette pour l’instant.{' '}
        <Link href="/recipes" className="underline">
          Ajouter ou importer des recettes
        </Link>
      </p>
    )
  }

  const { recipe } = daily
  const more = recipe.ingredients.length - INGREDIENT_LIMIT

  return (
    <div className="flex flex-col gap-3">
      <Link href={`/recipes/${recipe.id}`} className="font-medium underline-offset-2 hover:underline">
        {recipe.title}
      </Link>
      {recipe.ingredients.length > 0 && (
        <ul className="list-disc pl-5 text-sm" aria-label="Ingrédients">
          {recipe.ingredients.slice(0, INGREDIENT_LIMIT).map((ingredient, i) => (
            <li key={i} className="break-words">
              {ingredient}
            </li>
          ))}
          {more > 0 && <li className={`list-none ${muted}`}>et {more} autre{more > 1 ? 's' : ''}…</li>}
        </ul>
      )}
      {recipe.ingredients.length > 0 &&
        (daily.hasShoppingList ? (
          <AddToShopping recipeId={recipe.id} className={`${secondaryButton} text-sm`} />
        ) : (
          <p className={`text-xs ${muted}`}>
            <Link href="/settings" className="underline">
              Choisir une checklist des courses
            </Link>{' '}
            pour y envoyer les ingrédients.
          </p>
        ))}
      <p className={`text-xs ${muted}`}>
        <Link href="/recipes" className="underline">
          Toutes les recettes
        </Link>
      </p>
    </div>
  )
}
