/** Widgets du dashboard, dans l'ordre par défaut. Les ids sont stockés dans `synapse.settings.widget_order`. */
export const WIDGET_IDS = [
  'activities',
  'mail',
  'trend',
  'sleep',
  'cash',
  'todo',
  'shopping',
  'agenda',
  'weather',
  'mood',
  'habits',
  'daily-recipe',
] as const

export type WidgetId = (typeof WIDGET_IDS)[number]

const KNOWN = new Set<string>(WIDGET_IDS)

/**
 * Ordre affiché : ids enregistrés connus (sans doublon), puis les widgets absents
 * de l'ordre enregistré (ajoutés depuis) dans l'ordre par défaut.
 */
export function resolveWidgetOrder(saved: readonly string[] | null | undefined): WidgetId[] {
  const seen = new Set<string>()
  const order: WidgetId[] = []
  for (const id of saved ?? []) {
    if (KNOWN.has(id) && !seen.has(id)) {
      seen.add(id)
      order.push(id as WidgetId)
    }
  }
  for (const id of WIDGET_IDS) if (!seen.has(id)) order.push(id)
  return order
}
