import { readGoogleAccount } from '@/lib/connectors/google'
import { GoogleForms } from '@/components/settings/GoogleForms'
import { card } from './styles'

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
      <GoogleForms account={google ? { needsReauth: google.needsReauth } : null} code={code} />
    </section>
  )
}
