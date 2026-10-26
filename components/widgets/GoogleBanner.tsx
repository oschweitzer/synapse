import { readGoogleAccount } from '@/lib/connectors/google'

const muted = 'text-slate-500 dark:text-slate-400'

/** Invitation à connecter Google, dans un widget vide. */
export function ConnectGoogle({ what }: { what: string }) {
  return (
    <p className={`text-sm ${muted}`}>
      Connecte Google pour afficher {what}.{' '}
      {/* Route handler (redirection vers Google) : pas de <Link>, qui la préchargerait. */}
      <a href="/api/google/connect" className="underline">
        Connecter Google
      </a>
    </p>
  )
}

/** Bandeau du dashboard quand Google a refusé le jeton : les données affichées ne se mettent plus à jour. */
export async function GoogleReauthBanner() {
  let account
  try {
    account = await readGoogleAccount()
  } catch (e) {
    console.error('[google] lecture du compte', e)
    return null
  }
  if (!account?.needsReauth) return null

  return (
    <div
      role="alert"
      className="mb-4 flex flex-col gap-2 border border-amber-400 bg-amber-wash p-3 text-sm text-ink-100 sm:flex-row sm:items-center sm:justify-between"
    >
      <p>Google a refusé l’accès de Synapse : l’agenda et les mails ne se mettent plus à jour.</p>
      <a
        href="/api/google/connect"
        className="hud-btn hud-btn--primary hud-btn--sm shrink-0"
      >
        Reconnecter Google
      </a>
    </div>
  )
}
