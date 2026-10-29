import { createClient } from '@/lib/supabase/server'
import { listDashboards } from '@/lib/dashboards'
import { DASHBOARDS_MAX, DASHBOARD_NAME_MAX, WIDGETS } from '@/lib/dashboard'
import { createDashboard, deleteDashboard, resetDashboardOrder, saveDashboard, setDefaultDashboard } from '@/app/actions/dashboards'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { SectionMessage } from '@/components/settings/SectionMessage'
import { card, primaryButton, secondaryButton } from './styles'

/** Retours de la zone admin des dashboards (`?dashboards=…`) : [message, est une erreur]. */
const DASHBOARD_MESSAGES: Record<string, [string, boolean]> = {
  created: ['Dashboard créé. Choisis ses widgets ci-dessous.', false],
  saved: ['Dashboard enregistré.', false],
  'order-reset': ['Ordre par défaut rétabli.', false],
  default: ['Dashboard par défaut modifié.', false],
  deleted: ['Dashboard supprimé.', false],
  forbidden: ['Réservé aux administrateurs.', true],
  name: [`Donne un nom de ${DASHBOARD_NAME_MAX} caractères au plus.`, true],
  max: [`${DASHBOARDS_MAX} dashboards au plus : supprime-en un d’abord.`, true],
  sensitive: ['Un dashboard public ne peut pas afficher de widget sensible (marqués ci-dessous).', true],
  'default-delete': ['Le dashboard par défaut ne se supprime pas : désigne-en un autre d’abord.', true],
  invalid: ['Dashboard introuvable.', true],
  save: ['Enregistrement impossible, réessaie.', true],
}

/** Section « Dashboards (admin) » : la page ne la monte que pour un admin, les actions revérifient les droits. */
export async function DashboardsSection({ code }: { code?: string }) {
  const supabase = await createClient()
  const dashboards = await listDashboards(supabase).catch((e) => {
    console.error('[settings] lecture des dashboards', e)
    return null
  })

  return (
    <section id="dashboards" className={`${card} mt-4`}>
      <h2 className="font-semibold">Dashboards (admin)</h2>
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Choisis les widgets de chaque dashboard. Un dashboard <strong>privé</strong> n’est servi qu’une fois le
        verrouillage levé ; un dashboard <strong>public</strong> ne demande que la connexion, et ne peut pas
        afficher de widget sensible. L’ordre se change par glisser-déposer sur le dashboard.
      </p>
      <SectionMessage message={code ? (DASHBOARD_MESSAGES[code] ?? DASHBOARD_MESSAGES.save) : null} />
      {dashboards === null && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          Lecture des dashboards impossible.
        </p>
      )}
      {dashboards?.map((dashboard) => (
        <form key={dashboard.id} action={saveDashboard} className="flex flex-col gap-3 border border-slate-200 p-3 dark:border-slate-700">
          <input type="hidden" name="id" value={dashboard.id} />
          <div className="flex flex-col gap-3 sm:flex-row">
            <label className="flex flex-1 flex-col gap-1 text-sm">
              Nom
              <input
                name="name"
                required
                maxLength={DASHBOARD_NAME_MAX}
                defaultValue={dashboard.name}
                className="hud-input"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Visibilité
              <select name="visibility" defaultValue={dashboard.visibility} className="hud-input">
                <option value="private">Privé (verrouillage)</option>
                <option value="public">Public (connexion seule)</option>
              </select>
            </label>
          </div>
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm">Widgets</legend>
            {WIDGETS.map((widget) => (
              <label key={widget.id} className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  name="widgets"
                  value={widget.id}
                  defaultChecked={dashboard.widgets.includes(widget.id)}
                  className="mt-1"
                />
                <span>
                  {widget.label}
                  {widget.sensitive && <span className="text-amber-600 dark:text-amber-400"> · sensible</span>}
                  <span className="block text-slate-500 dark:text-slate-400">
                    {widget.description} Source : {widget.source}.
                  </span>
                </span>
              </label>
            ))}
          </fieldset>
          <div className="flex flex-wrap items-center gap-3">
            <SubmitButton className={primaryButton}>
              Enregistrer
            </SubmitButton>
            <SubmitButton formAction={resetDashboardOrder} formNoValidate className={secondaryButton}>
              Rétablir l’ordre par défaut
            </SubmitButton>
            {dashboard.isDefault ? (
              <span className="text-sm text-slate-500 dark:text-slate-400">Dashboard par défaut</span>
            ) : (
              <>
                <SubmitButton formAction={setDefaultDashboard} formNoValidate className={secondaryButton}>
                  Définir par défaut
                </SubmitButton>
                <SubmitButton formAction={deleteDashboard} formNoValidate className={secondaryButton}>
                  Supprimer<span className="sr-only"> « {dashboard.name} »</span>
                </SubmitButton>
              </>
            )}
          </div>
        </form>
      ))}
      {dashboards && dashboards.length < DASHBOARDS_MAX && (
        <form action={createDashboard} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex flex-1 flex-col gap-1 text-sm">
            Nouveau dashboard
            <input name="name" required maxLength={DASHBOARD_NAME_MAX} className="hud-input" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Visibilité
            <select name="visibility" defaultValue="private" className="hud-input">
              <option value="private">Privé (verrouillage)</option>
              <option value="public">Public (connexion seule)</option>
            </select>
          </label>
          <SubmitButton className={primaryButton}>
            Créer
          </SubmitButton>
        </form>
      )}
    </section>
  )
}
