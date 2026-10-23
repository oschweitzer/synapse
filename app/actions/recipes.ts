'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { readShoppingChecklistId } from '@/lib/connectors/cairn'
import { fetchMealDb, MEALDB_IMPORT_MAX } from '@/lib/mealdb'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const TITLE_MAX = 200
const LINES_MAX = 100
const INGREDIENT_MAX = 200
const STEP_MAX = 2000

function text(formData: FormData, name: string) {
  const value = formData.get(name)
  return typeof value === 'string' ? value.trim() : ''
}

/** Zone de texte → une entrée par ligne non vide. `null` si une limite est dépassée. */
function lines(value: string, maxLength: number) {
  const list = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  if (list.length > LINES_MAX || list.some((line) => line.length > maxLength)) return null
  return list
}

/** Crée ou modifie une recette (`id` présent = modification), puis ouvre sa fiche. */
export async function saveRecipe(formData: FormData) {
  const id = text(formData, 'id')
  if (id && !UUID.test(id)) redirect('/recipes?error=unknown')
  const back = id ? `/recipes/${id}/edit` : '/recipes/new'

  const title = text(formData, 'title')
  const ingredients = lines(text(formData, 'ingredients'), INGREDIENT_MAX)
  const steps = lines(text(formData, 'steps'), STEP_MAX)
  const sourceUrl = text(formData, 'source_url') || null
  if (!title || title.length > TITLE_MAX) redirect(`${back}?error=title`)
  if (!ingredients || !steps) redirect(`${back}?error=too-long`)
  if (sourceUrl && (!/^https?:\/\//i.test(sourceUrl) || !URL.canParse(sourceUrl))) redirect(`${back}?error=url`)

  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) redirect('/login')

  const fields = { title, ingredients, steps, source_url: sourceUrl }
  const query = id
    ? supabase.schema('synapse').from('recipes').update(fields).eq('id', id)
    : supabase.schema('synapse').from('recipes').insert({ ...fields, user_id: auth.user.id })
  const { data, error } = await query.select('id').maybeSingle()
  if (error) {
    console.error('[recipes] enregistrement', error)
    redirect(`${back}?error=save`)
  }
  if (!data) redirect('/recipes?error=unknown')

  revalidatePath('/')
  revalidatePath('/recipes')
  redirect(`/recipes/${data.id}`)
}

export async function deleteRecipe(formData: FormData) {
  const id = text(formData, 'id')
  if (!UUID.test(id)) redirect('/recipes?error=unknown')

  const supabase = await createClient()
  const { error } = await supabase.schema('synapse').from('recipes').delete().eq('id', id)
  if (error) {
    console.error('[recipes] suppression', error)
    redirect(`/recipes/${id}?error=delete`)
  }

  revalidatePath('/')
  revalidatePath('/recipes')
  redirect('/recipes?deleted=1')
}

/** Import TheMealDB : par nom, ou au hasard si la recherche est vide. Une recette déjà importée est ignorée. */
export async function importFromMealDb(formData: FormData) {
  const query = text(formData, 'query').slice(0, 100)
  const requested = Number.parseInt(text(formData, 'count'), 10)
  const count = Number.isFinite(requested) ? Math.min(Math.max(requested, 1), MEALDB_IMPORT_MAX) : 5

  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) redirect('/login')

  let recipes
  try {
    recipes = await fetchMealDb(query, count)
  } catch (e) {
    console.error('[recipes] TheMealDB', e)
    redirect('/recipes?error=mealdb')
  }
  if (recipes.length === 0) redirect('/recipes?imported=0')

  const { data, error } = await supabase
    .schema('synapse')
    .from('recipes')
    .upsert(
      recipes.map((recipe) => ({ ...recipe, user_id: auth.user.id })),
      { onConflict: 'user_id,mealdb_id', ignoreDuplicates: true },
    )
    .select('id')
  if (error) {
    console.error('[recipes] import', error)
    redirect('/recipes?error=save')
  }

  const imported = data?.length ?? 0
  revalidatePath('/')
  revalidatePath('/recipes')
  redirect(`/recipes?imported=${imported}&skipped=${recipes.length - imported}`)
}

/**
 * Ajoute un item par ingrédient en fin de la checklist Cairn des courses
 * (`position` = max + 1, puis + 2…). Écriture de données autorisée par la RLS
 * de Cairn ; jamais dans une checklist du coffre.
 */
export async function addIngredientsToShopping(recipeId: string): Promise<{ error?: string; added?: number }> {
  if (!UUID.test(recipeId)) return { error: 'Recette inconnue.' }

  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return { error: 'Session expirée, reconnecte-toi.' }

  const [recipe, noteId] = await Promise.all([
    supabase.schema('synapse').from('recipes').select('ingredients').eq('id', recipeId).maybeSingle(),
    readShoppingChecklistId(),
  ])
  if (recipe.error) {
    console.error('[recipes] lecture pour les courses', recipe.error)
    return { error: 'Impossible de lire la recette.' }
  }
  if (!recipe.data) return { error: 'Recette introuvable.' }
  const ingredients = recipe.data.ingredients as string[]
  if (ingredients.length === 0) return { error: 'Cette recette n’a pas d’ingrédients.' }
  if (!noteId) return { error: 'Aucune checklist des courses choisie dans les réglages.' }

  const [note, last] = await Promise.all([
    supabase
      .from('notes')
      .select('id')
      .eq('id', noteId)
      .eq('kind', 'checklist')
      .eq('is_encrypted', false)
      .is('deleted_at', null)
      .maybeSingle(),
    supabase
      .from('checklist_items')
      .select('position')
      .eq('note_id', noteId)
      .order('position', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])
  if (note.error || last.error) {
    console.error('[cairn] checklist des courses', note.error ?? last.error)
    return { error: 'Impossible de lire la liste de courses.' }
  }
  if (!note.data) return { error: 'La checklist des courses est introuvable ou passée au coffre.' }

  const start = ((last.data?.position as number | undefined) ?? -1) + 1
  const { error } = await supabase.from('checklist_items').insert(
    ingredients.map((content, i) => ({
      note_id: noteId,
      user_id: auth.user.id,
      content,
      position: start + i,
    })),
  )
  if (error) {
    console.error('[cairn] ajout des ingrédients', error)
    return { error: 'Impossible d’écrire dans Cairn.' }
  }

  revalidatePath('/')
  return { added: ingredients.length }
}
