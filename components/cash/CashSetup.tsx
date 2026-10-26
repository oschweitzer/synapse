import Link from 'next/link'
import type { CashRead } from '@/lib/connectors/cash'
import { ConnectGoogle } from '@/components/widgets/GoogleBanner'
import { SheetPicker } from './SheetPicker'

const muted = 'text-slate-500 dark:text-slate-400'

export type PickerProps = { clientId: string; apiKey: string; appId: string } | null

/** Ce qu'il reste à faire avant de pouvoir saisir des dépenses. */
export function CashSetup({ cash, picker }: { cash: Exclude<CashRead, { status: 'ok' }>; picker: PickerProps }) {
  switch (cash.status) {
    case 'google-disconnected':
      return <ConnectGoogle what="tes dépenses cash" />
    case 'google-reauth':
    case 'needs-scope':
      return (
        <p className={`text-sm ${muted}`}>
          {cash.status === 'needs-scope'
            ? 'Synapse doit pouvoir ouvrir le fichier des dépenses : reconnecte Google et accepte l’accès aux fichiers choisis.'
            : 'Google a refusé l’accès de Synapse.'}{' '}
          {/* Route handler (redirection vers Google) : pas de <Link>, qui la préchargerait. */}
          <a href="/api/google/connect" className="underline">
            Reconnecter Google
          </a>
        </p>
      )
    case 'no-sheet':
      return (
        <div className="flex flex-col gap-2">
          <p className={`text-sm ${muted}`}>
            Choisis le Google Sheet des dépenses (« Dépenses Liquide »). Synapse n’aura accès qu’à ce fichier.
          </p>
          {picker ? (
            <SheetPicker {...picker} loginHint={cash.googleEmail} />
          ) : (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              Google Picker non configuré côté serveur (SYNAPSE_GOOGLE_PICKER_API_KEY).
            </p>
          )}
        </div>
      )
    case 'needs-migration':
      return (
        <p className={`text-sm ${muted}`}>
          « {cash.title} » n’est pas encore au format de Synapse (onglet Saisies).{' '}
          <Link href="/cash/migration" className="underline">
            Migrer le fichier
          </Link>
        </p>
      )
  }
}
