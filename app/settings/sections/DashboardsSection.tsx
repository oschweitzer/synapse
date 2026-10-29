import { createClient } from '@/lib/supabase/server'
import { listDashboards } from '@/lib/dashboards'
import { DashboardForms } from '@/components/settings/DashboardForms'
import { card } from './styles'

/** Section « Dashboards (admin) » : la page ne la monte que pour un admin, les actions revérifient les droits. */
export async function DashboardsSection() {
  const supabase = await createClient()
  const dashboards = await listDashboards(supabase).catch((e) => {
    console.error('[settings] lecture des dashboards', e)
    return null
  })

  return (
    <section id="dashboards" className={`${card} mt-4`}>
      <h2 className="font-semibold">Dashboards (admin)</h2>
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Choisis les widgets de chaque dashboard. Un dashboard <strong>privé</strong> n’est servi qu’une fois le
        verrouillage levé ; un dashboard <strong>public</strong> ne demande que la connexion, et ne peut pas
        afficher de widget sensible. L’ordre se change par glisser-déposer sur le dashboard.
      </p>
      <DashboardForms dashboards={dashboards} />
    </section>
  )
}
