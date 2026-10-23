import { createClient } from '@/lib/supabase/server'
import { dayKey } from '@/lib/time'
import type { Tables } from '@/lib/types/synapse'
import { readShoppingChecklistId } from './cairn'
import type { Connector } from './types'

/**
 * Recette du jour : tirée au premier affichage de la journée (fuseau
 * Europe/Paris) par `synapse.pick_daily_recipe`, qui l'enregistre dans
 * `synapse.meal_plan`. Les affichages suivants relisent la même.
 */

export type RecipeRow = Tables<{ schema: 'synapse' }, 'recipes'>

type DailyRecipeRow = Pick<RecipeRow, 'id' | 'title' | 'ingredients' | 'source_url'>

export type DailyRecipe =
  | { status: 'empty' }
  | {
      status: 'ok'
      recipe: DailyRecipeRow
      /** Une checklist Cairn des courses est choisie dans les réglages. */
      hasShoppingList: boolean
    }

export const dailyRecipeConnector: Connector<DailyRecipe> = {
  id: 'meals',
  async read() {
    const supabase = await createClient()
    const [picked, shoppingId] = await Promise.all([
      supabase.schema('synapse').rpc('pick_daily_recipe', { p_day: dayKey(new Date()) }),
      readShoppingChecklistId(),
    ])
    if (picked.error) throw picked.error
    const recipeId = picked.data as string | null
    if (!recipeId) return { data: { status: 'empty' }, syncedAt: null }

    const { data, error } = await supabase
      .schema('synapse')
      .from('recipes')
      .select('id, title, ingredients, source_url')
      .eq('id', recipeId)
      .single()
    if (error) throw error

    return {
      data: { status: 'ok', recipe: data as DailyRecipeRow, hasShoppingList: shoppingId != null },
      syncedAt: null,
    }
  },
}
