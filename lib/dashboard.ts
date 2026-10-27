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

export const DASHBOARD_NAME_MAX = 40
export const DASHBOARDS_MAX = 10
