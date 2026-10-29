import { createClient } from '@/lib/supabase/server'
import { listShoppingCandidates } from '@/lib/connectors/cairn'
import { ShoppingForm } from '@/components/settings/ShoppingForm'
import { card } from './styles'

/** Section « Liste de courses » : checklist Cairn du widget « Courses ». */
export async function ShoppingSection() {
  const supabase = await createClient()
  const [candidates, settings] = await Promise.all([
    listShoppingCandidates(),
    supabase.schema('synapse').from('settings').select('cairn_shopping_checklist_id').maybeSingle(),
  ])
  if (settings.error) console.error('[settings] lecture', settings.error)
  const current = (settings.data?.cairn_shopping_checklist_id as string | null | undefined) ?? ''

  return (
    <section className={card}>
      <h2 className="font-semibold">Liste de courses</h2>
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Checklist Cairn affichée dans le widget « Courses ». Les checklists du coffre ne sont pas proposées :
        Synapse ne peut ni les lire ni les cocher.
      </p>
      <ShoppingForm candidates={candidates} current={current} />
    </section>
  )
}
