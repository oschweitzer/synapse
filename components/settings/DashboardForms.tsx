'use client'

import { useActionState, type FormEvent } from 'react'
import { createDashboard, deleteDashboard, resetDashboardOrder, saveDashboard, setDefaultDashboard } from '@/app/actions/dashboards'
import { DASHBOARDS_MAX, DASHBOARD_NAME_MAX, WIDGETS } from '@/lib/dashboard'
import type { DashboardRow } from '@/lib/dashboards'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { SectionMessage } from '@/components/settings/SectionMessage'
import { useLastSubmitted } from '@/components/settings/useLastSubmitted'
import { primaryButton, secondaryButton } from '@/app/settings/sections/styles'

/** Retours de la zone admin des dashboards : [message, est une erreur]. */
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

/** Message d'un code de retour ; un code inconnu retombe sur « save ». */
function dashboardMessage(code: string): [string, boolean] {
  return DASHBOARD_MESSAGES[code] ?? DASHBOARD_MESSAGES.save
}

type Action = 'create' | 'save' | 'reset' | 'default' | 'delete'

/** Action du bouton qui a envoyé le formulaire (`data-action`), `fallback` si le navigateur n'indique pas le bouton. */
function submittedAction(e: FormEvent<HTMLFormElement>, fallback: Action | null): Action | null {
  const value = (e.nativeEvent as SubmitEvent).submitter?.getAttribute('data-action')
  return value === 'save' || value === 'reset' || value === 'default' || value === 'delete' || value === 'create' ? value : fallback
}

/**
 * Liste des dashboards, formulaire de création et message de la section « Dashboards (admin) ».
 * Les actions tournent sans navigation ; la liste se met à jour par la revalidation de `/settings`.
 */
export function DashboardForms({ dashboards }: { dashboards: DashboardRow[] | null }) {
  // Les actions serveur sont passées telles quelles (jamais enveloppées) : une fonction enveloppante ferait rendre
  // `javascript:throw…` comme `action` du formulaire, et les formulaires ne marcheraient plus sans JavaScript.
  const [createState, createAction] = useActionState(createDashboard, null)
  const [saveState, saveAction] = useActionState(saveDashboard, null)
  const [resetState, resetAction] = useActionState(resetDashboardOrder, null)
  const [defaultState, defaultAction] = useActionState(setDefaultDashboard, null)
  const [deleteState, deleteAction] = useActionState(deleteDashboard, null)

  // Quand le navigateur n'indique pas le bouton d'un formulaire de dashboard, `submittedAction` renvoie null : on ne
  // présume pas « save », et le premier état rempli est affiché.
  const [state, setLast] = useLastSubmitted({
    create: createState,
    save: saveState,
    reset: resetState,
    default: defaultState,
    delete: deleteState,
  })

  return (
    <>
      {state && <SectionMessage key={`${state.code}-${state.at}`} message={dashboardMessage(state.code)} />}
      {dashboards === null && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          Lecture des dashboards impossible.
        </p>
      )}
      {dashboards?.map((dashboard) => (
        <form
          key={dashboard.id}
          action={saveAction}
          onSubmit={(e) => setLast(submittedAction(e, null))}
          className="flex flex-col gap-3 border border-slate-200 p-3 dark:border-slate-700"
        >
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
            <SubmitButton data-action="save" className={primaryButton}>
              Enregistrer
            </SubmitButton>
            <SubmitButton data-action="reset" formAction={resetAction} formNoValidate className={secondaryButton}>
              Rétablir l’ordre par défaut
            </SubmitButton>
            {dashboard.isDefault ? (
              <span className="text-sm text-slate-500 dark:text-slate-400">Dashboard par défaut</span>
            ) : (
              <>
                <SubmitButton data-action="default" formAction={defaultAction} formNoValidate className={secondaryButton}>
                  Définir par défaut
                </SubmitButton>
                <SubmitButton data-action="delete" formAction={deleteAction} formNoValidate className={secondaryButton}>
                  Supprimer<span className="sr-only"> « {dashboard.name} »</span>
                </SubmitButton>
              </>
            )}
          </div>
        </form>
      ))}
      {dashboards && dashboards.length < DASHBOARDS_MAX && (
        <form
          action={createAction}
          onSubmit={(e) => setLast(submittedAction(e, 'create'))}
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
        >
          <label className="flex flex-1 flex-col gap-1 text-sm">
            Nouveau dashboard
            {/* La clé remonte les champs à chaque résultat : React 19 vide les champs non contrôlés après l'action, `defaultValue` remet ce qui a été saisi. */}
            <input
              key={createState?.at ?? 0}
              name="name"
              required
              maxLength={DASHBOARD_NAME_MAX}
              defaultValue={createState?.name ?? ''}
              className="hud-input"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Visibilité
            <select
              key={createState?.at ?? 0}
              name="visibility"
              defaultValue={createState?.visibility ?? 'private'}
              className="hud-input"
            >
              <option value="private">Privé (verrouillage)</option>
              <option value="public">Public (connexion seule)</option>
            </select>
          </label>
          <SubmitButton data-action="create" className={primaryButton}>
            Créer
          </SubmitButton>
        </form>
      )}
    </>
  )
}
