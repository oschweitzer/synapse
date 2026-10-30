'use client'

import { useActionState, useEffect, useRef, useState, type FormEvent } from 'react'
import { createDashboard, deleteDashboard, resetDashboardOrder, saveDashboard, setDefaultDashboard } from '@/app/actions/dashboards'
import { DASHBOARDS_MAX, DASHBOARD_NAME_MAX, WIDGETS, WIDGET_IDS, type WidgetId } from '@/lib/dashboard'
import type { DashboardRow } from '@/lib/dashboards'
import { Icon } from '@/components/ui/Icon'
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

const BY_ID = new Map(WIDGETS.map((w) => [w.id, w]))

/**
 * Cases des widgets, dans l'ordre du dashboard (cochés d'abord) puis celui du catalogue, avec des flèches monter/descendre.
 * L'ordre du formulaire est l'ordre des cases dans le DOM. Le champ `initialWidgets` garde l'ordre affiché au montage :
 * `saveDashboard` s'en sert pour détecter un ordre modifié entre-temps ailleurs.
 */
function WidgetList({ selected }: { selected: WidgetId[] }) {
  const [order, setOrder] = useState<WidgetId[]>(() => [...selected, ...WIDGET_IDS.filter((id) => !selected.includes(id))])
  const [initialWidgets] = useState(() => selected.join(','))
  const [announce, setAnnounce] = useState('')
  const [pendingFocus, setPendingFocus] = useState<string | null>(null)
  const buttons = useRef(new Map<string, HTMLButtonElement>())
  const fieldset = useRef<HTMLFieldSetElement>(null)

  // Le bouton cliqué peut être désactivé une fois le widget en bout de liste : le focus est remis après le rendu.
  useEffect(() => {
    if (pendingFocus) buttons.current.get(pendingFocus)?.focus()
  }, [pendingFocus, order])

  function move(index: number, delta: -1 | 1) {
    const target = index + delta
    const id = order[index]
    const next = [...order]
    ;[next[index], next[target]] = [next[target], next[index]]
    setOrder(next)
    // Seuls les widgets cochés sont enregistrés : pour un widget coché, la position annoncée est parmi les cochés.
    const checked = new Set(
      Array.from(fieldset.current?.querySelectorAll<HTMLInputElement>('input[name="widgets"]:checked') ?? [], (c) => c.value),
    )
    const [list, position] = checked.has(id)
      ? [next.filter((w) => checked.has(w)), next.filter((w) => checked.has(w)).indexOf(id) + 1]
      : [next, target + 1]
    setAnnounce(`« ${BY_ID.get(id)!.label} » déplacé en position ${position} sur ${list.length}.`)
    const atEnd = delta === -1 ? target === 0 : target === next.length - 1
    setPendingFocus(`${id}:${(delta === -1) !== atEnd ? 'up' : 'down'}`)
  }

  const setButton = (key: string) => (el: HTMLButtonElement | null) => {
    if (el) buttons.current.set(key, el)
    else buttons.current.delete(key)
  }

  return (
    <fieldset ref={fieldset} className="flex flex-col gap-2">
      <legend className="text-sm">Widgets</legend>
      <input type="hidden" name="initialWidgets" value={initialWidgets} />
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Les flèches changent l’ordre des widgets cochés ; il est enregistré avec le formulaire. Seul l’ordre des widgets
        cochés est conservé : la place des widgets non cochés n’est pas enregistrée.
      </p>
      <ol className="flex flex-col gap-2">
        {order.map((id, index) => {
          const widget = BY_ID.get(id)!
          return (
            <li key={id} className="flex items-start gap-2">
              <label className="flex flex-1 items-start gap-2 text-sm">
                <input type="checkbox" name="widgets" value={id} defaultChecked={selected.includes(id)} className="mt-1" />
                <span>
                  {widget.label}
                  {widget.sensitive && <span className="text-amber-600 dark:text-amber-400"> · sensible</span>}
                  <span className="block text-slate-500 dark:text-slate-400">
                    {widget.description} Source : {widget.source}.
                  </span>
                </span>
              </label>
              <div className="flex gap-1">
                <button
                  type="button"
                  ref={setButton(`${id}:up`)}
                  className={`${secondaryButton} min-h-11 min-w-11 justify-center`}
                  aria-label={`Monter « ${widget.label} »`}
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                >
                  <Icon name="up" size={14} />
                </button>
                <button
                  type="button"
                  ref={setButton(`${id}:down`)}
                  className={`${secondaryButton} min-h-11 min-w-11 justify-center`}
                  aria-label={`Descendre « ${widget.label} »`}
                  disabled={index === order.length - 1}
                  onClick={() => move(index, 1)}
                >
                  <Icon name="down" size={14} />
                </button>
              </div>
            </li>
          )
        })}
      </ol>
      <p aria-live="polite" className="sr-only">
        {announce}
      </p>
    </fieldset>
  )
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

  // La liste de widgets n'est remontée qu'après l'enregistrement ou la réinitialisation de son propre dashboard :
  // un autre changement côté serveur (ordre modifié ailleurs) ne doit pas effacer les modifications non enregistrées.
  const submitTarget = useRef<{ id: string; action: 'save' | 'reset' } | null>(null)
  const [remountCounts, setRemountCounts] = useState<Record<string, number>>({})
  const remount = (action: 'save' | 'reset') => {
    const target = submitTarget.current
    if (!target || target.action !== action) return
    submitTarget.current = null
    setRemountCounts((counts) => ({ ...counts, [target.id]: (counts[target.id] ?? 0) + 1 }))
  }
  useEffect(() => {
    if (resetState) remount('reset')
  }, [resetState])
  useEffect(() => {
    // Un enregistrement refusé garde la saisie pour que l'admin la corrige.
    if (saveState?.code === 'saved') remount('save')
  }, [saveState])

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
          onSubmit={(e) => {
            const action = submittedAction(e, null)
            submitTarget.current = action === 'reset' || action === 'save' ? { id: dashboard.id, action } : null
            setLast(action)
          }}
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
          <WidgetList key={remountCounts[dashboard.id] ?? 0} selected={dashboard.widgets} />
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
