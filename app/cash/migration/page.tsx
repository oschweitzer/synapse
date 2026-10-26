import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { CashError, previewMigration, type MigrationPreview } from '@/lib/connectors/cash'
import { MigrationForm } from '@/components/cash/MigrationForm'
import { card, muted } from '@/components/recipes/ui'

/** Migration unique du fichier vers les onglets Saisies, Catégories et Récap, après aperçu. */
export default async function CashMigrationPage() {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) redirect('/login')

  let preview: MigrationPreview
  try {
    preview = await previewMigration()
  } catch (e) {
    if (!(e instanceof CashError)) console.error('[cash] aperçu de la migration', e)
    preview = {
      status: 'error',
      message: e instanceof CashError ? e.message : 'Google Sheets ne répond pas, réessaie plus tard.',
    }
  }

  return (
    <main className="mx-auto max-w-xl px-4 py-6">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Migrer le fichier</h1>
        <Link href="/cash" className={`text-sm underline ${muted}`}>
          Retour aux dépenses
        </Link>
      </header>

      <section className={card}>
        {preview.status === 'already-migrated' && (
          <p className="text-sm">
            Le fichier est déjà migré (onglet Saisies présent) : rien à faire.{' '}
            <Link href="/cash" className="underline">
              Voir les dépenses
            </Link>
          </p>
        )}
        {preview.status === 'error' && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {preview.message}
          </p>
        )}
        {preview.status === 'ready' && (
          <>
            <p className={`text-sm ${muted}`}>
              « {preview.title} », onglet « {preview.sourceTitle} ». Synapse crée les onglets Saisies, Catégories et
              Récap en une seule opération, puis y recopie les lignes ci-dessous. Rien n’est écrit avant « Migrer le
              fichier ».
            </p>
            <MigrationForm plan={preview.plan} />
          </>
        )}
      </section>
    </main>
  )
}
