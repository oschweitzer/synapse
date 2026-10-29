'use client'

import { useActionState, useState } from 'react'
import { disconnectGoogle, syncGoogleNow } from '@/app/actions/google'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { SectionMessage } from '@/components/settings/SectionMessage'
import { primaryButton, secondaryButton } from '@/app/settings/sections/styles'

/** Retours du flux Google (`?google=…`) et des actions : [message, est une erreur]. */
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
  'disconnect-error': ['La déconnexion a échoué, réessaie.', true],
  error: ['Connexion à Google impossible, réessaie.', true],
}

/**
 * Boutons de la section « Google (agenda et mails) » et son message.
 * Les actions tournent sans navigation ; `code` est le `?google=…` du retour OAuth, remplacé par le message
 * de la dernière action. Toujours rendu, avec ou sans compte : son état survit à la déconnexion.
 */
export function GoogleForms({ account, code }: { account: { needsReauth: boolean } | null; code?: string }) {
  // Les actions serveur sont passées telles quelles : une fonction enveloppante ferait rendre `javascript:throw…`
  // comme `action` du formulaire, et l'envoi ne marcherait plus sans JavaScript.
  const [syncState, syncAction] = useActionState(syncGoogleNow, null)
  const [disconnectState, disconnectAction] = useActionState(disconnectGoogle, null)
  const [last, setLast] = useState<'sync' | 'disconnect' | null>(null)

  // Message du dernier formulaire envoyé. Sans JavaScript `onSubmit` ne tourne pas (`last` reste null) :
  // seul l'état revenu du POST natif est rempli, on affiche celui qui l'est.
  const state = last === 'sync' ? syncState : last === 'disconnect' ? disconnectState : (disconnectState ?? syncState)
  const shown = state?.code ?? code
  const message = shown ? (GOOGLE_MESSAGES[shown] ?? GOOGLE_MESSAGES.error) : null

  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row">
        <a href="/api/google/connect" className={primaryButton}>
          {account ? 'Reconnecter Google' : 'Connecter Google'}
        </a>
        {account && !account.needsReauth && (
          <form action={syncAction} onSubmit={() => setLast('sync')}>
            <SubmitButton className={`${secondaryButton} w-full`}>Synchroniser maintenant</SubmitButton>
          </form>
        )}
        {account && (
          <form action={disconnectAction} onSubmit={() => setLast('disconnect')}>
            <SubmitButton className={`${secondaryButton} w-full`}>Déconnecter</SubmitButton>
          </form>
        )}
      </div>
      <SectionMessage key={state?.at ?? 'query'} message={message} />
    </>
  )
}
