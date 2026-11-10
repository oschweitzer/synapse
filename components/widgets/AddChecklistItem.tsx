'use client'

import { useEffect, useId, useState, useOptimistic, useTransition, type FormEvent } from 'react'
import { addChecklistItem } from '@/app/actions/cairn'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

const muted = 'text-slate-500 dark:text-slate-400'

/**
 * Formulaire d'ajout d'un item à une checklist Cairn. Avec `storageKey` (widget « À faire »),
 * un sélecteur « Liste » choisit la checklist et mémorise le dernier choix ; sans lui et avec
 * une seule checklist (courses), pas de sélecteur. L'item ajouté s'affiche aussitôt en attente,
 * puis la liste rechargée (revalidatePath) le montre comme un item ordinaire.
 */
export function AddChecklistItem({
  checklists,
  storageKey,
  label,
}: {
  checklists: { id: string; label: string }[]
  storageKey?: string
  label: string
}) {
  const inputId = useId()
  const [noteId, setNoteId] = useState(checklists[0]?.id ?? '')
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [adding, addOptimistic] = useOptimistic<string[], string>([], (list, next) => [...list, next])

  // Dernier choix mémorisé, retenu seulement s'il désigne encore une checklist proposée.
  useEffect(() => {
    if (!storageKey) return
    try {
      const stored = localStorage.getItem(storageKey)
      if (stored && checklists.some((c) => c.id === stored)) setNoteId(stored)
    } catch {
      // Stockage indisponible : on garde la première checklist.
    }
    // Lecture au montage seulement : les changements suivants viennent du sélecteur.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Une checklist disparue (rechargement) ne doit plus recevoir d'ajout.
  const selected = checklists.some((c) => c.id === noteId) ? noteId : (checklists[0]?.id ?? '')

  function choose(id: string) {
    setNoteId(id)
    if (!storageKey) return
    try {
      localStorage.setItem(storageKey, id)
    } catch {
      // Stockage indisponible : le choix vaut pour cette session seulement.
    }
  }

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const value = text.trim()
    if (!value) {
      setError('Le texte est vide.')
      document.getElementById(inputId)?.focus()
      return
    }
    setError(null)
    setText('')
    startTransition(async () => {
      addOptimistic(value)
      const result = await addChecklistItem(selected, value)
      if (result.error) {
        setText((current) => (current === '' ? value : current))
        setError(result.error)
      }
    })
    document.getElementById(inputId)?.focus()
  }

  const showSelect = checklists.length > 1 || storageKey !== undefined

  return (
    <div className="flex flex-col gap-2">
      {adding.length > 0 && (
        <ul aria-label="Ajouts en cours" className={`flex flex-col gap-1 text-sm ${muted}`}>
          {adding.map((item, i) => (
            <li key={i} className="break-words">
              {item}
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={submit} className="flex flex-col gap-2">
        {showSelect && (
          <div className="hud-field">
            <label className="hud-sr" htmlFor={`${inputId}-list`}>
              Liste
            </label>
            <select
              id={`${inputId}-list`}
              className="hud-input hud-input--sm"
              value={selected}
              onChange={(e) => choose(e.target.value)}
            >
              {checklists.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="flex items-start gap-2">
          <Input
            id={inputId}
            size="sm"
            label={label}
            className="flex-1"
            value={text}
            maxLength={500}
            placeholder={label}
            error={error ?? undefined}
            onChange={(e) => {
              setText(e.target.value)
              if (error) setError(null)
            }}
          />
          <Button type="submit" variant="quiet" size="sm" icon="plus" iconOnly loading={pending} className="mt-5">
            Ajouter
          </Button>
        </div>
      </form>
    </div>
  )
}
