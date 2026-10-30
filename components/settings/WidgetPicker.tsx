'use client'

import { useEffect, useId, useRef, useState, type RefObject } from 'react'
import { matchesWidgetQuery, widgetsBySource, type Widget, type WidgetId } from '@/lib/dashboard'
import { Badge } from '@/components/ui/Badge'
import { Icon } from '@/components/ui/Icon'
import { primaryButton, secondaryButton } from '@/app/settings/sections/styles'

/**
 * Sélecteur « Ajouter un widget » : une boîte de dialogue modale (feuille du bas sur mobile) qui liste les widgets
 * disponibles par source, avec une recherche et une sélection multiple. Purement visuel : rien n'est posté,
 * `onAdd` reçoit les ids choisis dans l'ordre du catalogue.
 */
export function WidgetPicker({
  dashboardName,
  available,
  isPublic,
  onAdd,
  triggerRef,
}: {
  dashboardName: string
  available: readonly Widget[]
  isPublic: boolean
  onAdd: (ids: WidgetId[]) => void
  triggerRef: RefObject<HTMLButtonElement | null>
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Set<WidgetId>>(new Set())
  const dialogRef = useRef<HTMLDialogElement>(null)
  // Cible de l'appui : un glisser parti du contenu et relâché sur le fond ne doit pas fermer.
  const pressedOnDialog = useRef(false)
  const titleId = useId()
  const explanationId = useId()

  // Le dialogue natif gère le piège du focus, l'arrière-plan inerte et la couche supérieure.
  useEffect(() => {
    const dialog = dialogRef.current
    if (open && dialog && !dialog.open) dialog.showModal()
  }, [open])

  function close() {
    const dialog = dialogRef.current
    if (dialog?.open) dialog.close()
    setOpen(false)
    setSelected(new Set())
    setQuery('')
    triggerRef.current?.focus()
  }

  function confirm() {
    // Un widget sensible choisi avant que le dashboard ne devienne public est ignoré.
    const ids = available.filter((w) => selected.has(w.id) && !(isPublic && w.sensitive)).map((w) => w.id)
    if (ids.length > 0) onAdd(ids)
    close()
  }

  function toggle(id: WidgetId) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const groups = widgetsBySource(available.filter((w) => matchesWidgetQuery(w, query)))
  const count = available.filter((w) => selected.has(w.id) && !(isPublic && w.sensitive)).length

  return (
    <>
      <button type="button" ref={triggerRef} className={secondaryButton} disabled={available.length === 0} onClick={() => setOpen(true)}>
        <Icon name="plus" size={14} />
        Ajouter un widget <span className="sr-only">à « {dashboardName} »</span>
      </button>
      {available.length === 0 && (
        <p className="text-sm text-slate-500 dark:text-slate-400">Tous les widgets sont déjà sur ce dashboard.</p>
      )}
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        onCancel={(e) => {
          e.preventDefault()
          close()
        }}
        onMouseDown={(e) => {
          pressedOnDialog.current = e.target === dialogRef.current
        }}
        onClick={(e) => {
          if (e.target === dialogRef.current && pressedOnDialog.current) close()
        }}
        className="hud-card m-0 mt-auto w-full max-w-none max-h-[85vh] backdrop:bg-black/60 sm:m-auto sm:max-w-lg sm:max-h-[80vh]"
      >
        {open && (
          <div className="flex flex-col gap-3 p-4">
            <h3 id={titleId} className="text-base">
              Ajouter des widgets à « {dashboardName} »
            </h3>
            <input
              type="search"
              aria-label="Rechercher un widget"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                // Entrée ne doit pas envoyer le formulaire du dashboard.
                if (e.key === 'Enter') e.preventDefault()
              }}
              className="hud-input"
            />
            {isPublic && (
              <p id={explanationId} className="text-sm text-slate-500 dark:text-slate-400">
                Un dashboard public ne peut pas afficher de widget sensible.
              </p>
            )}
            <div className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto">
              {groups.map((group) => (
                <fieldset key={group.source} className="flex flex-col gap-1">
                  <legend className="text-sm">{group.source}</legend>
                  {group.widgets.map((w) => {
                    const blocked = isPublic && w.sensitive
                    return (
                      <label key={w.id} className="flex min-h-11 items-start gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={selected.has(w.id)}
                          disabled={blocked}
                          aria-describedby={blocked ? explanationId : undefined}
                          onChange={() => toggle(w.id)}
                          className="mt-1"
                        />
                        <span>
                          {w.label}
                          {w.sensitive && (
                            <>
                              {' '}
                              <Badge tone="amber">sensible</Badge>
                            </>
                          )}
                          <span className="block text-slate-500 dark:text-slate-400">
                            {w.description} Source : {w.source}.
                          </span>
                        </span>
                      </label>
                    )
                  })}
                </fieldset>
              ))}
              {groups.length === 0 && <p className="text-sm">Aucun widget ne correspond.</p>}
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" className={`${secondaryButton} min-h-11`} onClick={close}>
                Annuler
              </button>
              <button type="button" className={`${primaryButton} min-h-11`} disabled={count === 0} onClick={confirm}>
                Ajouter ({count})
              </button>
            </div>
          </div>
        )}
      </dialog>
    </>
  )
}
