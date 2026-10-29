import { HABITS_MAX, listHabits } from '@/lib/connectors/mood'
import { HabitsForms } from '@/components/settings/HabitsForms'
import { card } from './styles'

/** Section « Habitudes » : habitudes cochées chaque jour dans le widget « Habitudes ». */
export async function HabitsSection() {
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
      <HabitsForms habits={habits} max={HABITS_MAX} />
    </section>
  )
}
