import Link from 'next/link'
import { notFound } from 'next/navigation'
import { RecipeForm } from '@/components/recipes/RecipeForm'
import { muted } from '@/components/recipes/ui'
import { readRecipe } from '@/lib/recipes'

export default async function EditRecipePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string }>
}) {
  const [{ id }, { error }] = await Promise.all([params, searchParams])
  const recipe = await readRecipe(id)
  if (!recipe) notFound()

  return (
    <main className="mx-auto max-w-xl px-4 py-6">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold uppercase tracking-wider">Modifier la recette</h1>
        <Link href={`/recipes/${recipe.id}`} className={`text-sm underline ${muted}`}>
          Retour à la recette
        </Link>
      </header>
      <RecipeForm recipe={recipe} error={error} />
    </main>
  )
}
