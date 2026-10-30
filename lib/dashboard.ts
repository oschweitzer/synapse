/**
 * Catalogue des widgets. `sensitive` : données personnelles (mails, santé, argent) qu'un
 * dashboard public ne peut pas afficher. L'ordre du catalogue est l'ordre par défaut.
 */
export const WIDGETS = [
  { id: 'activities', label: 'Activités', description: 'Dernières activités sportives.', source: 'Garmin', sensitive: true },
  { id: 'mail', label: 'Mails', description: 'En-têtes des derniers mails.', source: 'Gmail', sensitive: true },
  { id: 'trend', label: '7 derniers jours', description: 'Courbes de forme sur la semaine.', source: 'Garmin', sensitive: true },
  { id: 'sleep', label: 'Sommeil', description: 'Dernière nuit.', source: 'Garmin', sensitive: true },
  { id: 'cash', label: 'Dépenses cash', description: 'Dépenses saisies dans la feuille Google.', source: 'Google Sheets', sensitive: true },
  { id: 'todo', label: 'À faire', description: 'Tâches du jour.', source: 'Cairn', sensitive: false },
  { id: 'shopping', label: 'Courses', description: 'Liste de courses.', source: 'Cairn', sensitive: false },
  { id: 'agenda', label: 'Agenda', description: 'Prochains événements.', source: 'Google Agenda', sensitive: false },
  { id: 'weather', label: 'Météo', description: 'Météo des villes choisies.', source: 'Open-Meteo', sensitive: false },
  { id: 'mood', label: 'Humeur', description: 'Humeur du jour.', source: 'Synapse', sensitive: true },
  { id: 'habits', label: 'Habitudes', description: 'Habitudes à cocher.', source: 'Synapse', sensitive: false },
  { id: 'daily-recipe', label: 'Recette du jour', description: 'Recette proposée pour aujourd’hui.', source: 'Synapse', sensitive: false },
] as const

export type WidgetId = (typeof WIDGETS)[number]['id']

export type Widget = (typeof WIDGETS)[number]

export const WIDGET_IDS: readonly WidgetId[] = WIDGETS.map((w) => w.id)

const KNOWN = new Set<string>(WIDGET_IDS)
const SENSITIVE = new Set<string>(WIDGETS.filter((w) => w.sensitive).map((w) => w.id))

export type Visibility = 'public' | 'private'

export function isVisibility(value: unknown): value is Visibility {
  return value === 'public' || value === 'private'
}

/** Ids connus, sans doublon, dans l'ordre donné. */
export function normalizeWidgets(ids: readonly string[] | null | undefined): WidgetId[] {
  const seen = new Set<string>()
  const out: WidgetId[] = []
  for (const id of ids ?? []) {
    if (KNOWN.has(id) && !seen.has(id)) {
      seen.add(id)
      out.push(id as WidgetId)
    }
  }
  return out
}

/** Widgets sensibles d'une liste (interdits sur un dashboard public). */
export function sensitiveWidgets(ids: readonly string[]): WidgetId[] {
  return ids.filter((id): id is WidgetId => SENSITIVE.has(id))
}

/** Minuscules sans accents, pour comparer sans tenir compte de la casse ni des accents. */
function fold(text: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
}

/** Un widget correspond à la recherche si elle est vide, ou contenue dans son libellé, sa description ou sa source (sans casse ni accents). */
export function matchesWidgetQuery(widget: Widget, query: string): boolean {
  const q = fold(query.trim())
  if (q === '') return true
  return [widget.label, widget.description, widget.source].some((text) => fold(text).includes(q))
}

/** Regroupe les widgets par source, dans l'ordre de première apparition, en gardant l'ordre donné dans chaque groupe. */
export function widgetsBySource(widgets: readonly Widget[]): { source: string; widgets: Widget[] }[] {
  const groups = new Map<string, Widget[]>()
  for (const widget of widgets) {
    const group = groups.get(widget.source)
    if (group) group.push(widget)
    else groups.set(widget.source, [widget])
  }
  return Array.from(groups, ([source, list]) => ({ source, widgets: list }))
}

export const DASHBOARD_NAME_MAX = 40
export const DASHBOARDS_MAX = 10
