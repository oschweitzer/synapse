import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { shoppingConnector, todoConnector, weatherConnector } from '@/lib/connectors'
import { WidgetSkeleton } from '@/components/widgets/WidgetShell'
import { WidgetSlot } from '@/components/widgets/WidgetSlot'
import { WeatherWidget } from '@/components/widgets/Weather'
import { TodoWidget } from '@/components/widgets/Todo'
import { ShoppingWidget } from '@/components/widgets/Shopping'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (!data.user) redirect('/login')

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Synapse</h1>
        <div className="flex items-center gap-4">
          <Link href="/settings" className="text-sm text-slate-500 underline">
            Réglages
          </Link>
          <form action="/auth/signout" method="post">
            <button type="submit" className="text-sm text-slate-500 underline">
              Se déconnecter
            </button>
          </form>
        </div>
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
        <Suspense fallback={<WidgetSkeleton title="À faire" />}>
          <WidgetSlot
            title="À faire"
            connector={todoConnector}
            userId={data.user.id}
            render={(todo) => <TodoWidget todo={todo} />}
          />
        </Suspense>
        <Suspense fallback={<WidgetSkeleton title="Courses" />}>
          <WidgetSlot
            title="Courses"
            connector={shoppingConnector}
            userId={data.user.id}
            render={(shopping) => <ShoppingWidget shopping={shopping} />}
          />
        </Suspense>
      </div>
    </main>
  )
}
