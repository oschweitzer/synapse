'use client'

import { useContext, useEffect, useRef, useState, useTransition } from 'react'
import { updateChecklistItemContent } from '@/app/actions/cairn'
import { Button } from '@/components/ui/Button'
import { ItemLabelContext } from './CheckItem'

/**
 * Texte d'un item Cairn, modifiable sur place : le crayon (ou un clic sur le texte) ouvre un
 * champ, Entrée ou la perte de focus enregistre, Échap annule. Le nouveau texte s'affiche tout
 * de suite ; si le serveur échoue, l'ancien revient et l'erreur s'affiche sous la ligne.
 */
export function ItemText({ id, content }: { id: string; content: string }) {
  const [shown, setShown] = useState(content)
  const [seen, setSeen] = useState(content)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(content)
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()
  const reportLabel = useContext(ItemLabelContext)
  // Entrée et Échap ferment le champ, ce qui déclenche un blur : il ne doit pas enregistrer deux fois.
  const done = useRef(false)

  // Les props rechargées (revalidatePath) font foi sur le texte affiché.
  if (content !== seen) {
    setSeen(content)
    setShown(content)
  }

  // La case à cocher parente suit le texte affiché (optimiste, puis rétabli en cas d'échec).
  useEffect(() => reportLabel(shown), [shown, reportLabel])

  function startEdit() {
    // Sélectionner du texte à la souris ne doit pas ouvrir l'édition.
    if (window.getSelection()?.toString()) return
    done.current = false
    setDraft(shown)
    setError(null)
    setEditing(true)
  }

  function cancel() {
    done.current = true
    setError(null)
    setEditing(false)
  }

  function save() {
    if (done.current) return
    const text = draft.trim()
    if (!text) {
      setError('Le texte est vide.')
      return
    }
    done.current = true
    setEditing(false)
    if (text === shown) return
    const previous = shown
    setShown(text)
    setError(null)
    startTransition(async () => {
      const result = await updateChecklistItemContent(id, text)
      if (result.error) {
        setShown(previous)
        setError(result.error)
      }
    })
  }

  return (
    <div className="flex flex-col gap-0.5">
      {editing ? (
        <input
          autoFocus
          type="text"
          value={draft}
          maxLength={500}
          aria-label={`Modifier « ${shown} »`}
          className="hud-input hud-input--sm"
          onChange={(e) => {
            setDraft(e.target.value)
            if (error) setError(null)
          }}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              // Entrée qui valide une composition (IME) n'enregistre pas.
              if (e.nativeEvent.isComposing) return
              e.preventDefault()
              save()
            } else if (e.key === 'Escape') {
              e.preventDefault()
              cancel()
            }
          }}
        />
      ) : (
        <div className="flex items-start gap-1">
          {/* Le clic est un raccourci souris : le clavier passe par le bouton. */}
          <p className="flex-1 break-words" onClick={startEdit}>
            {shown}
          </p>
          <Button variant="quiet" size="sm" icon="edit" iconOnly onClick={startEdit}>
            {`Modifier « ${shown} »`}
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" aria-live="polite" className="text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  )
}
