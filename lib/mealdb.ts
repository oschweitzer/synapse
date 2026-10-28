/**
 * TheMealDB (gratuit, clé de test publique « 1 ») : import ponctuel pour amorcer
 * la base de recettes. Les recettes y sont en anglais.
 */

import { envUrl } from '@/lib/env'

const DEFAULT_API = 'https://www.themealdb.com/api/json/v1/1'

/** Recettes importées au plus par passage. */
export const MEALDB_IMPORT_MAX = 10

type MealDbMeal = Record<string, string | null | undefined> & { idMeal: string; strMeal: string }

export type ImportedRecipe = {
  mealdb_id: string
  title: string
  ingredients: string[]
  steps: string[]
  source_url: string
}

/** Lien de la recette : la source d'origine si elle est donnée, sinon la page TheMealDB. */
function sourceUrl(meal: MealDbMeal) {
  const source = meal.strSource?.trim()
  if (source && /^https?:\/\//.test(source)) return source
  return `https://www.themealdb.com/meal/${meal.idMeal}`
}

/** Une recette TheMealDB → ligne `synapse.recipes` (ingrédients `strIngredient1…20` + `strMeasure1…20`). */
export function toRecipe(meal: MealDbMeal): ImportedRecipe {
  const ingredients: string[] = []
  for (let i = 1; i <= 20; i++) {
    const name = meal[`strIngredient${i}`]?.trim()
    if (!name) continue
    const measure = meal[`strMeasure${i}`]?.trim()
    ingredients.push(measure ? `${name} (${measure})` : name)
  }

  const steps = (meal.strInstructions ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    // Lignes « STEP 1 », « 1. » ou « 1 » seules : la numérotation est refaite à l'affichage.
    .filter((line) => line && !/^(step\s*)?\d+[.):]?$/i.test(line))

  return {
    mealdb_id: meal.idMeal,
    title: meal.strMeal.trim(),
    ingredients,
    steps,
    source_url: sourceUrl(meal),
  }
}

async function fetchMeals(path: string): Promise<MealDbMeal[]> {
  const res = await fetch(`${envUrl('MEALDB_API_URL', DEFAULT_API)}/${path}`, { cache: 'no-store', signal: AbortSignal.timeout(10_000) })
  if (!res.ok) throw new Error(`TheMealDB ${res.status}`)
  const body = (await res.json()) as { meals: MealDbMeal[] | null }
  return (body.meals ?? []).filter((meal) => meal?.idMeal && meal.strMeal?.trim())
}

/** Recherche par nom (en anglais), ou `count` recettes au hasard si `query` est vide. */
export async function fetchMealDb(query: string, count: number): Promise<ImportedRecipe[]> {
  const meals = query
    ? await fetchMeals(`search.php?s=${encodeURIComponent(query)}`)
    : (await Promise.all(Array.from({ length: count }, () => fetchMeals('random.php')))).flat()

  // Le hasard peut renvoyer deux fois la même recette.
  const unique = new Map(meals.map((meal) => [meal.idMeal, meal]))
  return [...unique.values()].slice(0, count).map(toRecipe)
}
