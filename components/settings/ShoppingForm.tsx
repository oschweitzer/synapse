'use client'

import { useActionState } from 'react'
import { saveShoppingChecklist } from '@/app/actions/cairn'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { SectionMessage } from '@/components/settings/SectionMessage'
import { primaryButton } from '@/app/settings/sections/styles'

const MESSAGES: Record<string, string> = {
  invalid: 'Cette checklist n’est pas utilisable (introuvable ou dans le coffre).',
  save: 'Enregistrement impossible, réessayez.',
}

/**
 * Formulaire de la section « Liste de courses » : l'action tourne sans navigation et le message
 * s'affiche dans la section. Sans JavaScript, le formulaire est envoyé normalement et la page rendue porte le message.
 */
export function ShoppingForm({ candidates, current }: { candidates: { id: string; label: string }[]; current: string }) {
  const [state, action] = useActionState(saveShoppingChecklist, null)
  const isError = state !== null && state.code !== 'saved'

  return (
    <>
      {/* La clé remonte le champ à chaque résultat : React 19 réinitialise les champs non contrôlés après l'action, `defaultValue` remet le choix envoyé. */}
      <form action={action} className="flex flex-col gap-3 sm:flex-row">
        <label htmlFor="note_id" className="sr-only">
          Checklist des courses
        </label>
        <select
          id="note_id"
          name="note_id"
          key={state?.at ?? 0}
          defaultValue={state?.noteId ?? current}
          aria-describedby={isError ? 'settings-error' : undefined}
          className="hud-input flex-1"
        >
          <option value="">— Aucune —</option>
          {candidates.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
        <SubmitButton className={primaryButton}>Enregistrer</SubmitButton>
      </form>
      {candidates.length === 0 && (
        <p className="text-sm text-slate-500 dark:text-slate-400">Aucune checklist non chiffrée dans Cairn.</p>
      )}
      {state &&
        (isError ? (
          <SectionMessage key={state.at} message={[MESSAGES[state.code] ?? MESSAGES.save, true]} id="settings-error" />
        ) : (
          <SectionMessage key={state.at} message={['Enregistré.', false]} />
        ))}
    </>
  )
}
