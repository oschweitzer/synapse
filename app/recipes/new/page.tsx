import Link from 'next/link'
import { RecipeForm } from '@/components/recipes/RecipeForm'
import { muted } from '@/components/recipes/ui'

export default async function NewRecipePage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams

  return (
    <main className="mx-auto max-w-xl px-4 py-6">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Nouvelle recette</h1>
        <Link href="/recipes" className={`text-sm underline ${muted}`}>
          Recettes
        </Link>
      </header>
      <RecipeForm error={error} />
    </main>
  )
}
