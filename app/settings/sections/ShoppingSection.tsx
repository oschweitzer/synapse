import { createClient } from '@/lib/supabase/server'
import { listShoppingCandidates } from '@/lib/connectors/cairn'
import { saveShoppingChecklist } from '@/app/actions/cairn'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { SectionMessage } from '@/components/settings/SectionMessage'
import { card, primaryButton } from './styles'

const MESSAGES: Record<string, string> = {
  invalid: 'Cette checklist n’est pas utilisable (introuvable ou dans le coffre).',
  save: 'Enregistrement impossible, réessayez.',
}

/** Section « Liste de courses » : checklist Cairn du widget « Courses ». */
export async function ShoppingSection({ saved, error: errorCode }: { saved?: string; error?: string }) {
  const supabase = await createClient()
  const [candidates, settings] = await Promise.all([
    listShoppingCandidates(),
    supabase.schema('synapse').from('settings').select('cairn_shopping_checklist_id').maybeSingle(),
  ])
  if (settings.error) console.error('[settings] lecture', settings.error)
  const current = (settings.data?.cairn_shopping_checklist_id as string | null | undefined) ?? ''
  const error = errorCode ? (MESSAGES[errorCode] ?? MESSAGES.save) : null

  return (
    <section className={card}>
      <h2 className="font-semibold">Liste de courses</h2>
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Checklist Cairn affichée dans le widget « Courses ». Les checklists du coffre ne sont pas proposées :
        Synapse ne peut ni les lire ni les cocher.
      </p>
      <form action={saveShoppingChecklist} className="flex flex-col gap-3 sm:flex-row">
        <label htmlFor="note_id" className="sr-only">
          Checklist des courses
        </label>
        <select
          id="note_id"
          name="note_id"
          defaultValue={current}
          aria-describedby={error ? 'settings-error' : undefined}
          className="hud-input flex-1"
        >
          <option value="">— Aucune —</option>
          {candidates.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
        <SubmitButton className={primaryButton}>
          Enregistrer
        </SubmitButton>
      </form>
      {candidates.length === 0 && (
        <p className="text-sm text-slate-500 dark:text-slate-400">Aucune checklist non chiffrée dans Cairn.</p>
      )}
      {saved && !error && <SectionMessage message={['Enregistré.', false]} />}
      <SectionMessage message={error ? [error, true] : null} id="settings-error" />
    </section>
  )
}
