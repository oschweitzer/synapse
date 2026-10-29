import Link from 'next/link'
import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { isAdminUser } from '@/lib/admin'
import { readLockConfig } from '@/lib/lock/config'
import { AutoLock } from '@/components/lock/AutoLock'
import { SectionFallback } from './sections/SectionFallback'
import { ShoppingSection } from './sections/ShoppingSection'
import { DashboardsSection } from './sections/DashboardsSection'
import { WeatherSection } from './sections/WeatherSection'
import { LockSection } from './sections/LockSection'
import { HabitsSection } from './sections/HabitsSection'
import { GoogleSection } from './sections/GoogleSection'
import { CashSection } from './sections/CashSection'

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ google?: string }>
}) {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (!data.user) redirect('/login')

  const params = await searchParams
  const isAdmin = isAdminUser(data.user)
  // Lecture légère nécessaire avant le streaming ; la section Verrouillage relit sa propre copie.
  const lock = await readLockConfig(supabase).catch((e) => {
    console.error('[settings] lecture du verrouillage', e)
    return null
  })

  // Chaque section charge ses données dans sa propre frontière Suspense : une source lente ne retarde pas les autres.
  return (
    <main className="mx-auto max-w-xl px-4 py-6">
      {lock && <AutoLock idleMinutes={lock.idleMinutes} />}
      <header className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold uppercase tracking-wider">Réglages</h1>
        <Link href="/" className="text-sm text-slate-500 underline">
          Retour au dashboard
        </Link>
      </header>

      <Suspense fallback={<SectionFallback title="Liste de courses" />}>
        <ShoppingSection />
      </Suspense>

      {isAdmin && (
        <Suspense fallback={<SectionFallback title="Dashboards (admin)" className="mt-4" />}>
          <DashboardsSection />
        </Suspense>
      )}

      <Suspense fallback={<SectionFallback title="Météo" className="mt-4" />}>
        <WeatherSection />
      </Suspense>

      <Suspense fallback={<SectionFallback title="Verrouillage" className="mt-4" />}>
        <LockSection />
      </Suspense>

      <Suspense fallback={<SectionFallback title="Habitudes" className="mt-4" />}>
        <HabitsSection />
      </Suspense>

      <Suspense fallback={<SectionFallback title="Google (agenda et mails)" className="mt-4" />}>
        <GoogleSection code={params.google} />
      </Suspense>

      <Suspense fallback={<SectionFallback title="Dépenses cash" className="mt-4" />}>
        <CashSection />
      </Suspense>
    </main>
  )
}
