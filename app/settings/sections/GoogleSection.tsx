import { disconnectGoogle, syncGoogleNow } from '@/app/actions/google'
import { readGoogleAccount } from '@/lib/connectors/google'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { SectionMessage } from '@/components/settings/SectionMessage'
import { card, primaryButton, secondaryButton } from './styles'

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

/** Section « Google (agenda et mails) » : état de la connexion et synchro. */
export async function GoogleSection({ code }: { code?: string }) {
  const google = await readGoogleAccount().catch((e) => {
    console.error('[settings] lecture du compte Google', e)
    return null
  })

  return (
    <section className={`${card} mt-4`}>
      <h2 className="font-semibold">Google (agenda et mails)</h2>
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Lecture seule : évènements de la veille à J+7 et en-têtes des 20 derniers mails de la boîte de réception,
        synchronisés toutes les 30 min. Le corps des mails n’est jamais lu. Pour les dépenses cash, accès au seul
        fichier choisi plus bas, en lecture et écriture.
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
            <SubmitButton className={`${secondaryButton} w-full`}>
              Synchroniser maintenant
            </SubmitButton>
          </form>
        )}
        {google && (
          <form action={disconnectGoogle}>
            <SubmitButton className={`${secondaryButton} w-full`}>
              Déconnecter
            </SubmitButton>
          </form>
        )}
      </div>
      <SectionMessage message={code ? (GOOGLE_MESSAGES[code] ?? GOOGLE_MESSAGES.error) : null} />
    </section>
  )
}
