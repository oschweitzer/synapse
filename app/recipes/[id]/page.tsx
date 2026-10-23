import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AddToShopping } from '@/components/recipes/AddToShopping'
import { DeleteRecipe } from '@/components/recipes/DeleteRecipe'
import { card, muted, primaryButton, secondaryButton } from '@/components/recipes/ui'
import { readShoppingChecklistId } from '@/lib/connectors/cairn'
import { readRecipe } from '@/lib/recipes'

export default async function RecipePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string }>
}) {
  const [{ id }, { error }] = await Promise.all([params, searchParams])
  const [recipe, shoppingId] = await Promise.all([readRecipe(id), readShoppingChecklistId()])
  if (!recipe) notFound()

  return (
    <main className="mx-auto max-w-xl px-4 py-6">
      <header className="mb-6 flex items-center justify-between gap-4">
        <h1 className="min-w-0 break-words text-2xl font-semibold">{recipe.title}</h1>
        <Link href="/recipes" className={`shrink-0 text-sm underline ${muted}`}>
          Recettes
        </Link>
      </header>

      {error && (
        <p role="alert" className="mb-4 text-sm text-red-600 dark:text-red-400">
          Suppression impossible, réessaie.
        </p>
      )}

      <section className={card}>
        <h2 className="font-semibold">Ingrédients</h2>
        {recipe.ingredients.length === 0 ? (
          <p className={`text-sm ${muted}`}>Aucun ingrédient.</p>
        ) : (
          <ul className="list-disc pl-5 text-sm">
            {recipe.ingredients.map((ingredient, i) => (
              <li key={i} className="break-words">
                {ingredient}
              </li>
            ))}
          </ul>
        )}
        {recipe.ingredients.length > 0 &&
          (shoppingId ? (
            <AddToShopping recipeId={recipe.id} className={primaryButton} />
          ) : (
            <p className={`text-sm ${muted}`}>
              <Link href="/settings" className="underline">
                Choisir une checklist des courses
              </Link>{' '}
              pour y envoyer les ingrédients.
            </p>
          ))}
      </section>

      <section className={`${card} mt-4`}>
        <h2 className="font-semibold">Étapes</h2>
        {recipe.steps.length === 0 ? (
          <p className={`text-sm ${muted}`}>Aucune étape.</p>
        ) : (
          <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm">
            {recipe.steps.map((step, i) => (
              <li key={i} className="break-words">
                {step}
              </li>
            ))}
          </ol>
        )}
        {recipe.source_url && (
          <p className={`text-sm ${muted}`}>
            <a href={recipe.source_url} target="_blank" rel="noopener noreferrer" className="break-all underline">
              Source
            </a>
          </p>
        )}
      </section>

      <div className="mt-4 flex gap-3">
        <Link href={`/recipes/${recipe.id}/edit`} className={secondaryButton}>
          Modifier
        </Link>
        <DeleteRecipe id={recipe.id} title={recipe.title} />
      </div>
    </main>
  )
}
