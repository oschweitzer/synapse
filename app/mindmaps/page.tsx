import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createMindmap } from '@/app/actions/mindmaps'
import { TIME_ZONE } from '@/lib/time'
import { DeleteMindmap } from '@/components/mindmap/DeleteMindmap'
import { card, input, muted, primaryButton } from '@/components/recipes/ui'

const ERRORS: Record<string, string> = {
  title: 'Titre trop long (120 caractères au plus).',
  save: 'Enregistrement impossible, réessaie.',
  unknown: 'Carte introuvable.',
}

export default async function MindmapsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) redirect('/login')

  const { error: errorKey } = await searchParams
  const { data: maps, error } = await supabase
    .schema('synapse')
    .from('mindmaps')
    .select('id, title, updated_at')
    .order('updated_at', { ascending: false })
  if (error) console.error('[mindmaps] lecture', error)

  return (
    <main className="mx-auto max-w-xl px-4 py-6">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold uppercase tracking-wider">Mind maps</h1>
        <Link href="/" className={`text-sm underline ${muted}`}>
          Retour au dashboard
        </Link>
      </header>

      {(error || errorKey) && (
        <p role="alert" className="mb-4 text-sm text-red-600 dark:text-red-400">
          {error ? 'Lecture impossible, réessaie plus tard.' : (ERRORS[errorKey ?? ''] ?? ERRORS.save)}
        </p>
      )}

      <section className={card}>
        <h2 className="font-semibold">Nouvelle carte</h2>
        <form action={createMindmap} className="flex gap-2">
          <input name="title" aria-label="Titre de la carte" placeholder="Titre" maxLength={120} className={input} />
          <button type="submit" className={primaryButton}>
            Créer
          </button>
        </form>
      </section>

      <section className={`${card} mt-4`}>
        <h2 className="font-semibold">
          {maps?.length ?? 0} carte{(maps?.length ?? 0) > 1 ? 's' : ''}
        </h2>
        {!maps?.length ? (
          <p className={`text-sm ${muted}`}>Aucune carte pour l’instant.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-slate-200 dark:divide-slate-800">
            {maps.map((map) => (
              <li key={map.id} className="flex items-center justify-between gap-3 py-2">
                <Link href={`/mindmaps/${map.id}`} className="min-w-0 flex-1">
                  <span className="block break-words font-medium">{map.title}</span>
                  <span className={`text-xs ${muted}`}>
                    Modifiée le{' '}
                    {new Date(map.updated_at).toLocaleString('fr-FR', { timeZone: TIME_ZONE, dateStyle: 'short', timeStyle: 'short' })}
                  </span>
                </Link>
                <DeleteMindmap id={map.id} title={map.title} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
