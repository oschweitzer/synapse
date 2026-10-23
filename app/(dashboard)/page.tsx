import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { weatherConnector } from '@/lib/connectors'
import { WidgetSkeleton } from '@/components/widgets/WidgetShell'
import { WidgetSlot } from '@/components/widgets/WidgetSlot'
import { WeatherWidget } from '@/components/widgets/Weather'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (!data.user) redirect('/login')

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Synapse</h1>
        <form action="/auth/signout" method="post">
          <button type="submit" className="text-sm text-slate-500 underline">
            Se déconnecter
          </button>
        </form>
      </header>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Suspense fallback={<WidgetSkeleton title="Météo" />}>
          <WidgetSlot
            title="Météo"
            connector={weatherConnector}
            userId={data.user.id}
            render={(weather) => weather && <WeatherWidget weather={weather} />}
          />
        </Suspense>
      </div>
    </main>
  )
}
