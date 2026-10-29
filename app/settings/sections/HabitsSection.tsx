import { addHabit, archiveHabit } from '@/app/actions/mood'
import { HABITS_MAX, listHabits } from '@/lib/connectors/mood'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { SectionMessage } from '@/components/settings/SectionMessage'
import { card, primaryButton } from './styles'

/** Retours des habitudes (`?habits=…`) : [message, est une erreur]. */
const HABIT_MESSAGES: Record<string, [string, boolean]> = {
  added: ['Habitude ajoutée.', false],
  archived: ['Habitude retirée. Ses jours cochés sont conservés.', false],
  name: ['Donne un nom de 80 caractères au plus.', true],
  max: [`${HABITS_MAX} habitudes au plus : retires-en une d’abord.`, true],
  save: ['Enregistrement impossible, réessaie.', true],
}

/** Section « Habitudes » : habitudes cochées chaque jour dans le widget « Habitudes ». */
export async function HabitsSection({ code }: { code?: string }) {
  const habits = await listHabits().catch((e) => {
    console.error('[settings] lecture des habitudes', e)
    return null
  })

  return (
    <section className={`${card} mt-4`}>
      <h2 className="font-semibold">Habitudes</h2>
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Cochées chaque jour dans le widget « Habitudes » ({HABITS_MAX} au plus). Retirer une habitude la masque
        du dashboard sans effacer son historique.
      </p>
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
              <form action={archiveHabit}>
                <input type="hidden" name="id" value={habit.id} />
                <SubmitButton className="text-sm text-slate-500 underline dark:text-slate-400">
                  Retirer<span className="sr-only"> « {habit.name} »</span>
                </SubmitButton>
              </form>
            </li>
          ))}
        </ul>
      )}
      {(habits === null || habits.length < HABITS_MAX) && (
        <form action={addHabit} className="flex flex-col gap-3 sm:flex-row">
          <label htmlFor="habit-name" className="sr-only">
            Nouvelle habitude
          </label>
          <input
            id="habit-name"
            name="name"
            required
            maxLength={80}
            placeholder="Méditer, lire 20 min…"
            className="hud-input flex-1"
          />
          <SubmitButton className={primaryButton}>
            Ajouter
          </SubmitButton>
        </form>
      )}
      <SectionMessage message={code ? (HABIT_MESSAGES[code] ?? HABIT_MESSAGES.save) : null} />
    </section>
  )
}
