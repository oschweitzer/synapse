import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { listShoppingCandidates } from '@/lib/connectors/cairn'
import { saveShoppingChecklist } from '@/app/actions/cairn'

const MESSAGES: Record<string, string> = {
  invalid: 'Cette checklist n’est pas utilisable (introuvable ou dans le coffre).',
  save: 'Enregistrement impossible, réessayez.',
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>
}) {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (!data.user) redirect('/login')

  const params = await searchParams
  const [candidates, settings] = await Promise.all([
    listShoppingCandidates(),
    supabase.schema('synapse').from('settings').select('cairn_shopping_checklist_id').maybeSingle(),
  ])
  if (settings.error) console.error('[settings] lecture', settings.error)
  const current = (settings.data?.cairn_shopping_checklist_id as string | null | undefined) ?? ''
  const error = params.error ? (MESSAGES[params.error] ?? MESSAGES.save) : null

  return (
    <main className="mx-auto max-w-xl px-4 py-6">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Réglages</h1>
        <Link href="/" className="text-sm text-slate-500 underline">
          Retour au dashboard
        </Link>
      </header>

      <section className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
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
            className="flex-1 rounded border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          >
            <option value="">— Aucune —</option>
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded bg-slate-900 px-3 py-2 font-medium text-white dark:bg-slate-100 dark:text-slate-900"
          >
            Enregistrer
          </button>
        </form>
        {candidates.length === 0 && (
          <p className="text-sm text-slate-500 dark:text-slate-400">Aucune checklist non chiffrée dans Cairn.</p>
        )}
        {params.saved && !error && (
          <p role="status" className="text-sm text-green-700 dark:text-green-400">
            Enregistré.
          </p>
        )}
        {error && (
          <p id="settings-error" role="alert" className="text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
      </section>
    </main>
  )
}
