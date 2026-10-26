import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { readLockConfig } from '@/lib/lock/config'
import { UNLOCK_COOKIE, isUnlocked } from '@/lib/lock/token'
import { UnlockForm } from '@/components/lock/UnlockForm'

/** Redirection locale uniquement (pas d'URL absolue ni de `//host`). */
function safeNext(next: string | undefined): string {
  return next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/unlock') ? next : '/'
}

export default async function UnlockPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (!data.user) redirect('/login')

  const next = safeNext((await searchParams).next)

  let config
  let passkeyCount = 0
  try {
    config = await readLockConfig(supabase)
    if (!config) redirect(next)
    const cookieStore = await cookies()
    if (await isUnlocked(cookieStore.get(UNLOCK_COOKIE)?.value, data.user.id, config.epoch)) redirect(next)
    const { count } = await supabase.schema('synapse').from('lock_passkeys').select('id', { count: 'exact', head: true })
    passkeyCount = count ?? 0
  } catch (e) {
    // redirect() lève une exception de contrôle de Next : on la laisse passer.
    if (e instanceof Error && 'digest' in e) throw e
    console.error('[unlock] lecture du verrouillage', e)
    return (
      <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-4">
        <h1 className="font-display text-2xl font-semibold uppercase tracking-wider">Synapse</h1>
        <p role="alert" className="border border-danger bg-danger-wash px-3 py-2 text-sm text-danger">
          Impossible de vérifier le verrouillage. Réessaie dans un instant.
        </p>
      </main>
    )
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-4">
      <h1 className="font-display text-2xl font-semibold uppercase tracking-wider">Synapse</h1>
      <p className="text-sm text-slate-600 dark:text-slate-400">Dashboard verrouillé. Saisis ton code pour continuer.</p>
      <UnlockForm next={next} hasPasskeys={passkeyCount > 0} />
      <form action="/auth/signout" method="post">
        <button type="submit" className="text-sm text-slate-500 underline">
          Se déconnecter
        </button>
      </form>
    </main>
  )
}
