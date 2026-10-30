'use client'

import { useActionState, useEffect, useRef, useState, type FormEvent } from 'react'
import { createDashboard, deleteDashboard, resetDashboardOrder, saveDashboard, setDefaultDashboard } from '@/app/actions/dashboards'
import { DASHBOARDS_MAX, DASHBOARD_NAME_MAX, WIDGETS, sensitiveWidgets, type Visibility, type WidgetId } from '@/lib/dashboard'
import type { DashboardRow } from '@/lib/dashboards'
import { Badge } from '@/components/ui/Badge'
import { Icon } from '@/components/ui/Icon'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { WidgetPicker } from '@/components/settings/WidgetPicker'
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
 * Liste des widgets du dashboard, dans son ordre, avec des boutons monter/descendre et retirer, et le sélecteur d'ajout.
 * L'ordre du formulaire est l'ordre des champs cachés `widgets` dans le DOM. Le champ `initialWidgets` garde l'ordre
 * affiché au montage : `saveDashboard` s'en sert pour détecter un ordre modifié entre-temps ailleurs.
 */
function WidgetList({ selected, dashboardName, isPublic }: { selected: WidgetId[]; dashboardName: string; isPublic: boolean }) {
  const [order, setOrder] = useState<WidgetId[]>(() => [...selected])
  const [initialWidgets] = useState(() => selected.join(','))
  const [announce, setAnnounce] = useState('')
  const [pendingFocus, setPendingFocus] = useState<string | null>(null)
  const buttons = useRef(new Map<string, HTMLButtonElement>())
  const triggerRef = useRef<HTMLButtonElement>(null)

  // Le bouton cliqué peut être désactivé une fois le widget en bout de liste : le focus est remis après le rendu.
  useEffect(() => {
    if (!pendingFocus) return
    if (pendingFocus === 'add') triggerRef.current?.focus()
    else buttons.current.get(pendingFocus)?.focus()
    // La demande est consommée : un changement d'ordre ultérieur ne doit pas redonner le focus.
    setPendingFocus(null)
  }, [pendingFocus, order])

  function move(index: number, delta: -1 | 1) {
    const target = index + delta
    const id = order[index]
    const next = [...order]
    ;[next[index], next[target]] = [next[target], next[index]]
    setOrder(next)
    setAnnounce(`« ${BY_ID.get(id)!.label} » déplacé en position ${target + 1} sur ${next.length}.`)
    const atEnd = delta === -1 ? target === 0 : target === next.length - 1
    setPendingFocus(`${id}:${(delta === -1) !== atEnd ? 'up' : 'down'}`)
  }

  function remove(id: WidgetId) {
    setOrder(order.filter((w) => w !== id))
    setAnnounce(`« ${BY_ID.get(id)!.label} » retiré.`)
    setPendingFocus('add')
  }

  function add(ids: WidgetId[]) {
    setOrder([...order, ...ids])
    setAnnounce(ids.length === 1 ? '1 widget ajouté en fin de liste.' : `${ids.length} widgets ajoutés en fin de liste.`)
  }

  const setButton = (key: string) => (el: HTMLButtonElement | null) => {
    if (el) buttons.current.set(key, el)
    else buttons.current.delete(key)
  }

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm">Widgets</legend>
      <input type="hidden" name="initialWidgets" value={initialWidgets} />
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Les flèches changent l’ordre des widgets ; « Ajouter un widget » les place en fin de liste. L’ordre, les ajouts et
        les retraits sont enregistrés avec le formulaire.
      </p>
      {order.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">Aucun widget.</p>
      ) : (
        <ol className="flex flex-col gap-2">
          {order.map((id, index) => {
            const widget = BY_ID.get(id)!
            return (
              <li key={id} className="flex items-center gap-2">
                <input type="hidden" name="widgets" value={id} />
                <span className="flex-1 text-sm">{widget.label}</span>
                {widget.sensitive && <Badge tone="amber">sensible</Badge>}
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
                <button type="button" className={`${secondaryButton} min-h-11`} onClick={() => remove(id)}>
                  Retirer <span className="sr-only">« {widget.label} »</span>
                </button>
              </li>
            )
          })}
        </ol>
      )}
      {isPublic && sensitiveWidgets(order).length > 0 && (
        <p className="text-sm text-amber-600 dark:text-amber-400">
          Retire les widgets sensibles avant d’enregistrer : un dashboard public ne peut pas les afficher.
        </p>
      )}
      <WidgetPicker
        dashboardName={dashboardName}
        available={WIDGETS.filter((w) => !order.includes(w.id))}
        isPublic={isPublic}
        onAdd={add}
        triggerRef={triggerRef}
      />
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

  // Visibilité en cours de saisie par dashboard : le sélecteur de widgets s'en sert pour désactiver les widgets sensibles.
  // Le select reste non contrôlé ; React 19 réinitialise le formulaire après chaque action, ce qui efface la saisie ici aussi.
  const [visibilityEdits, setVisibilityEdits] = useState<Record<string, Visibility>>({})

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
          onReset={() =>
            setVisibilityEdits((v) => {
              const next = { ...v }
              delete next[dashboard.id]
              return next
            })
          }
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
              <select
                name="visibility"
                defaultValue={dashboard.visibility}
                onChange={(e) => setVisibilityEdits((v) => ({ ...v, [dashboard.id]: e.target.value as Visibility }))}
                className="hud-input"
              >
                <option value="private">Privé (verrouillage)</option>
                <option value="public">Public (connexion seule)</option>
              </select>
            </label>
          </div>
          <WidgetList
            key={remountCounts[dashboard.id] ?? 0}
            selected={dashboard.widgets}
            dashboardName={dashboard.name}
            isPublic={(visibilityEdits[dashboard.id] ?? dashboard.visibility) === 'public'}
          />
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
