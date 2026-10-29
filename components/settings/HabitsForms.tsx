'use client'

import { useActionState, useState } from 'react'
import { addHabit, archiveHabit } from '@/app/actions/mood'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { SectionMessage } from '@/components/settings/SectionMessage'
import { primaryButton } from '@/app/settings/sections/styles'
import type { SectionState } from '@/lib/settings/section-state'

/** Retours des habitudes : [message, est une erreur]. Le message « max » dépend de `max`, voir `habitMessage`. */
const HABIT_MESSAGES: Record<string, [string, boolean]> = {
  added: ['Habitude ajoutée.', false],
  archived: ['Habitude retirée. Ses jours cochés sont conservés.', false],
  name: ['Donne un nom de 80 caractères au plus.', true],
  save: ['Enregistrement impossible, réessaie.', true],
}

/** Message d'un code de retour ; un code inconnu retombe sur « save ». */
function habitMessage(code: string, max: number): [string, boolean] {
  if (code === 'max') return [`${max} habitudes au plus : retires-en une d’abord.`, true]
  return HABIT_MESSAGES[code] ?? HABIT_MESSAGES.save
}

/**
 * Liste des habitudes, formulaire d'ajout et message de la section « Habitudes ».
 * Les actions tournent sans navigation ; `max` vient de la section serveur (`HABITS_MAX`).
 */
export function HabitsForms({ habits, max }: { habits: { id: string; name: string }[] | null; max: number }) {
  const [addState, addAction] = useActionState(addHabit, null)
  const [last, setLast] = useState<'add' | 'archive' | null>(null)
  // L'action serveur est passée telle quelle : une fonction enveloppante ferait rendre `javascript:throw…` comme
  // `action` du formulaire, et le retrait ne marcherait plus sans JavaScript.
  const [archiveState, archiveAction] = useActionState(archiveHabit, null)

  // Erreurs de retrait par habitude, suivies côté client : l'id du formulaire envoyé, puis le résultat reçu.
  // Une erreur reste affichée jusqu'au prochain envoi de la même habitude ; un retrait réussi ne la masque pas.
  const [submittedId, setSubmittedId] = useState<string | null>(null)
  const [failed, setFailed] = useState<Record<string, NonNullable<SectionState>>>({})
  const [seenArchive, setSeenArchive] = useState(archiveState)
  if (archiveState !== seenArchive) {
    setSeenArchive(archiveState)
    if (archiveState && submittedId !== null && archiveState.code !== 'archived') {
      setFailed({ ...failed, [submittedId]: archiveState })
    }
  }
  const submitArchive = (id: string) => {
    setLast('archive')
    setSubmittedId(id)
    setFailed((current) => {
      const rest = { ...current }
      delete rest[id]
      return rest
    })
  }

  // Messages de la section : ceux du dernier formulaire envoyé. Sans JavaScript `onSubmit` ne tourne pas (`last` reste
  // null) : seul l'état revenu du POST natif est rempli, on affiche celui qui l'est. Pour les retraits, les erreurs encore en cours
  // restent visibles quand un retrait suivant réussit (une seule ligne par code).
  const archiveMessages = [...Object.values(failed), ...(archiveState ? [archiveState] : [])]
  const addMessages = addState ? [addState] : []
  const messages = last === 'add' ? addMessages : last === 'archive' ? archiveMessages : addMessages.length > 0 ? addMessages : archiveMessages
  const latest = messages.filter((m, i) => messages.findIndex((o) => o.code === m.code) === i)

  return (
    <>
      {habits === null ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          Lecture des habitudes impossible.
        </p>
      ) : habits.length === 0 ? (
        <p className="text-sm">Aucune habitude pour l’instant.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {habits.map((habit) => (
            <li key={habit.id} className="flex items-center justify-between gap-3 text-sm">
              <span className="min-w-0 break-words">{habit.name}</span>
              <form action={archiveAction} onSubmit={() => submitArchive(habit.id)}>
                <input type="hidden" name="id" value={habit.id} />
                <SubmitButton className="text-sm text-slate-500 underline dark:text-slate-400">
                  Retirer<span className="sr-only"> « {habit.name} »</span>
                </SubmitButton>
              </form>
            </li>
          ))}
        </ul>
      )}
      {(habits === null || habits.length < max) && (
        <form action={addAction} onSubmit={() => setLast('add')} className="flex flex-col gap-3 sm:flex-row">
          <label htmlFor="habit-name" className="sr-only">
            Nouvelle habitude
          </label>
          {/* La clé remonte le champ à chaque résultat : React 19 vide les champs non contrôlés après l'action, `defaultValue` remet le nom gardé. */}
          <input
            key={addState?.at ?? 0}
            id="habit-name"
            name="name"
            required
            maxLength={80}
            defaultValue={addState?.name ?? ''}
            placeholder="Méditer, lire 20 min…"
            className="hud-input flex-1"
          />
          <SubmitButton className={primaryButton}>Ajouter</SubmitButton>
        </form>
      )}
      {latest.map((state) => (
        <SectionMessage key={`${state.code}-${state.at}`} message={habitMessage(state.code, max)} />
      ))}
    </>
  )
}
