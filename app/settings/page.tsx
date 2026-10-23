import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { listShoppingCandidates } from '@/lib/connectors/cairn'
import { saveShoppingChecklist } from '@/app/actions/cairn'
import { disconnectGoogle, syncGoogleNow } from '@/app/actions/google'
import { readGoogleAccount } from '@/lib/connectors/google'

const MESSAGES: Record<string, string> = {
  invalid: 'Cette checklist n’est pas utilisable (introuvable ou dans le coffre).',
  save: 'Enregistrement impossible, réessayez.',
}

/** Retours du flux Google (`?google=…`) : [message, est une erreur]. */
const GOOGLE_MESSAGES: Record<string, [string, boolean]> = {
  connected: ['Google connecté. Première synchro lancée.', false],
  disconnected: ['Google déconnecté. Pense à retirer aussi l’accès dans ton compte Google.', false],
  synced: ['Synchro terminée.', false],
  denied: ['Autorisation refusée chez Google.', true],
  state: ['Le retour de Google n’a pas pu être vérifié. Recommence la connexion.', true],
  scopes: ['L’accès à l’agenda et à Gmail est nécessaire : coche les deux autorisations.', true],
  'no-refresh': [
    'Google n’a pas renvoyé de jeton durable. Retire l’accès de Synapse dans ton compte Google, puis recommence.',
    true,
  ],
  config: ['OAuth Google non configuré côté serveur (SYNAPSE_GOOGLE_CLIENT_ID / SYNAPSE_GOOGLE_CLIENT_SECRET).', true],
  'sync-error': ['La synchro a échoué. Détails dans le journal des synchros.', true],
  error: ['Connexion à Google impossible, réessaie.', true],
}

const card =
  'flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900'
const primaryButton =
  'rounded bg-slate-900 px-3 py-2 text-center font-medium text-white dark:bg-slate-100 dark:text-slate-900'
const secondaryButton =
  'rounded border border-slate-300 px-3 py-2 font-medium text-slate-900 dark:border-slate-700 dark:text-slate-100'

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string; google?: string }>
}) {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (!data.user) redirect('/login')

  const params = await searchParams
  const [candidates, settings, google] = await Promise.all([
    listShoppingCandidates(),
    supabase.schema('synapse').from('settings').select('cairn_shopping_checklist_id').maybeSingle(),
    readGoogleAccount().catch((e) => {
      console.error('[settings] lecture du compte Google', e)
      return null
    }),
  ])
  if (settings.error) console.error('[settings] lecture', settings.error)
  const current = (settings.data?.cairn_shopping_checklist_id as string | null | undefined) ?? ''
  const error = params.error ? (MESSAGES[params.error] ?? MESSAGES.save) : null
  const googleMessage = params.google ? (GOOGLE_MESSAGES[params.google] ?? GOOGLE_MESSAGES.error) : null

  return (
    <main className="mx-auto max-w-xl px-4 py-6">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Réglages</h1>
        <Link href="/" className="text-sm text-slate-500 underline">
          Retour au dashboard
        </Link>
      </header>

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
            className={primaryButton}
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

      <section className={`${card} mt-4`}>
        <h2 className="font-semibold">Google (agenda et mails)</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Lecture seule : évènements de la veille à J+7 et en-têtes des 20 derniers mails de la boîte de réception,
          synchronisés toutes les 30 min. Le corps des mails n’est jamais lu.
        </p>
        {google ? (
          <p className="text-sm">
            {google.needsReauth ? (
              <span className="font-medium text-amber-700 dark:text-amber-400">
                Google a refusé l’accès{google.email && <> de {google.email}</>} : reconnexion nécessaire.
              </span>
            ) : (
              <>Connecté{google.email && <> en tant que {google.email}</>}.</>
            )}
          </p>
        ) : (
          <p className="text-sm">Non connecté.</p>
        )}
        <div className="flex flex-col gap-3 sm:flex-row">
          <a href="/api/google/connect" className={primaryButton}>
            {google ? 'Reconnecter Google' : 'Connecter Google'}
          </a>
          {google && !google.needsReauth && (
            <form action={syncGoogleNow}>
              <button type="submit" className={`${secondaryButton} w-full`}>
                Synchroniser maintenant
              </button>
            </form>
          )}
          {google && (
            <form action={disconnectGoogle}>
              <button type="submit" className={`${secondaryButton} w-full`}>
                Déconnecter
              </button>
            </form>
          )}
        </div>
        {googleMessage && (
          <p
            role={googleMessage[1] ? 'alert' : 'status'}
            className={`text-sm ${googleMessage[1] ? 'text-red-600 dark:text-red-400' : 'text-green-700 dark:text-green-400'}`}
          >
            {googleMessage[0]}
          </p>
        )}
      </section>
    </main>
  )
}
