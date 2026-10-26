import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { importFromMealDb } from '@/app/actions/recipes'
import { MEALDB_IMPORT_MAX } from '@/lib/mealdb'
import { card, input, muted, primaryButton, secondaryButton } from '@/components/recipes/ui'

const ERRORS: Record<string, string> = {
  mealdb: 'TheMealDB ne répond pas, réessaie plus tard.',
  save: 'Enregistrement impossible, réessaie.',
  unknown: 'Recette introuvable.',
}

function importMessage(imported: number, skipped: number) {
  if (imported === 0 && skipped === 0) return 'Aucune recette trouvée sur TheMealDB.'
  const parts = [`${imported} recette${imported > 1 ? 's' : ''} importée${imported > 1 ? 's' : ''}`]
  if (skipped > 0) parts.push(`${skipped} déjà présente${skipped > 1 ? 's' : ''}`)
  return `${parts.join(', ')}.`
}

export default async function RecipesPage({
  searchParams,
}: {
  searchParams: Promise<{ imported?: string; skipped?: string; deleted?: string; error?: string }>
}) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) redirect('/login')

  const params = await searchParams
  const { data, error: readError } = await supabase
    .schema('synapse')
    .from('recipes')
    .select('id, title, ingredients')
    .order('title')
  if (readError) console.error('[recipes] lecture', readError)
  const recipes = (data ?? []) as { id: string; title: string; ingredients: string[] }[]

  const error = params.error ? (ERRORS[params.error] ?? ERRORS.save) : null
  const status =
    params.imported != null
      ? importMessage(Number(params.imported) || 0, Number(params.skipped) || 0)
      : params.deleted
        ? 'Recette supprimée.'
        : null

  return (
    <main className="mx-auto max-w-xl px-4 py-6">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold uppercase tracking-wider">Recettes</h1>
        <Link href="/" className={`text-sm underline ${muted}`}>
          Retour au dashboard
        </Link>
      </header>

      {status && !error && (
        <p role="status" className="mb-4 text-sm text-green-700 dark:text-green-400">
          {status}
        </p>
      )}
      {error && (
        <p role="alert" className="mb-4 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <section className={card}>
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold">
            {recipes.length} recette{recipes.length > 1 ? 's' : ''}
          </h2>
          <Link href="/recipes/new" className={`${primaryButton} text-sm`}>
            Nouvelle recette
          </Link>
        </div>
        {readError ? (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            Lecture des recettes impossible pour le moment.
          </p>
        ) : recipes.length === 0 ? (
          <p className={`text-sm ${muted}`}>Aucune recette. Saisis-en une ou importe-en depuis TheMealDB.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-slate-200 dark:divide-slate-800">
            {recipes.map((recipe) => (
              <li key={recipe.id} className="py-2">
                <Link href={`/recipes/${recipe.id}`} className="flex items-baseline justify-between gap-3 hover:underline">
                  <span className="min-w-0 break-words">{recipe.title}</span>
                  <span className={`shrink-0 text-xs ${muted}`}>
                    {recipe.ingredients.length} ingr.
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={`${card} mt-4`}>
        <h2 className="font-semibold">Importer depuis TheMealDB</h2>
        <p className={`text-sm ${muted}`}>
          Pour amorcer la base : recherche par nom (en anglais, ex. « chicken »), ou recettes au hasard si le champ
          est vide. Les recettes sont en anglais et restent modifiables ; une recette déjà importée est ignorée.
        </p>
        <form action={importFromMealDb} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex flex-1 flex-col gap-1 text-sm font-medium">
            Recherche
            <input name="query" maxLength={100} placeholder="Au hasard" className={`${input} font-normal`} />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Nombre
            <input
              name="count"
              type="number"
              min={1}
              max={MEALDB_IMPORT_MAX}
              defaultValue={5}
              className={`${input} w-24 font-normal`}
            />
          </label>
          <button type="submit" className={secondaryButton}>
            Importer
          </button>
        </form>
      </section>
    </main>
  )
}
