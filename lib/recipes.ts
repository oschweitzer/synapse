import { createClient } from '@/lib/supabase/server'
import type { RecipeRow } from '@/lib/connectors/meals'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type Recipe = Pick<RecipeRow, 'id' | 'title' | 'ingredients' | 'steps' | 'source_url'>

/** Une recette de l'utilisateur (RLS), ou `null` si l'id est inconnu. */
export async function readRecipe(id: string): Promise<Recipe | null> {
  if (!UUID.test(id)) return null
  const supabase = await createClient()
  const { data, error } = await supabase
    .schema('synapse')
    .from('recipes')
    .select('id, title, ingredients, steps, source_url')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data as Recipe | null
}
