import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import {
  activitiesConnector,
  agendaConnector,
  cashConnector,
  dailyRecipeConnector,
  habitsConnector,
  mailConnector,
  moodConnector,
  shoppingConnector,
  sleepConnector,
  todoConnector,
  trendConnector,
  weatherConnector,
} from '@/lib/connectors'
import { WidgetSkeleton } from '@/components/widgets/WidgetShell'
import { WidgetSlot } from '@/components/widgets/WidgetSlot'
import { WeatherWidget } from '@/components/widgets/Weather'
import { TodoWidget } from '@/components/widgets/Todo'
import { ShoppingWidget } from '@/components/widgets/Shopping'
import { AgendaWidget } from '@/components/widgets/Agenda'
import { MailWidget } from '@/components/widgets/Mail'
import { ActivitiesWidget, SleepWidget, TrendWidget } from '@/components/widgets/Garmin'
import { DailyRecipeWidget } from '@/components/widgets/DailyRecipe'
import { HabitsWidget, MoodWidget } from '@/components/widgets/Mood'
import { GoogleReauthBanner } from '@/components/widgets/GoogleBanner'
import { CashWidget } from '@/components/widgets/Cash'
import { pickerConfig } from '@/lib/google/oauth'
import { dayKey } from '@/lib/time'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (!data.user) redirect('/login')

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Synapse</h1>
        <div className="flex items-center gap-4">
          <Link href="/recipes" className="text-sm text-slate-500 underline">
            Recettes
          </Link>
          <Link href="/cash" className="text-sm text-slate-500 underline">
            Dépenses
          </Link>
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
      <Suspense fallback={null}>
        <GoogleReauthBanner />
      </Suspense>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Suspense fallback={<WidgetSkeleton title="Météo" />}>
          <WidgetSlot
            title="Météo"
            connector={weatherConnector}
            userId={data.user.id}
            render={(weather) => weather && <WeatherWidget weather={weather} />}
          />
        </Suspense>
        <Suspense fallback={<WidgetSkeleton title="Agenda" />}>
          <WidgetSlot
            title="Agenda"
            connector={agendaConnector}
            userId={data.user.id}
            render={(agenda) => <AgendaWidget agenda={agenda} />}
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
        <Suspense fallback={<WidgetSkeleton title="Humeur" />}>
          <WidgetSlot
            title="Humeur"
            connector={moodConnector}
            userId={data.user.id}
            render={(mood) => <MoodWidget mood={mood} />}
          />
        </Suspense>
        <Suspense fallback={<WidgetSkeleton title="Habitudes" />}>
          <WidgetSlot
            title="Habitudes"
            connector={habitsConnector}
            userId={data.user.id}
            render={(habits) => <HabitsWidget habits={habits} />}
          />
        </Suspense>
        <Suspense fallback={<WidgetSkeleton title="Dépenses cash" />}>
          <WidgetSlot
            title="Dépenses cash"
            connector={cashConnector}
            userId={data.user.id}
            render={(cash) => <CashWidget cash={cash} picker={pickerConfig()} today={dayKey(new Date())} />}
          />
        </Suspense>
        <Suspense fallback={<WidgetSkeleton title="Recette du jour" />}>
          <WidgetSlot
            title="Recette du jour"
            connector={dailyRecipeConnector}
            userId={data.user.id}
            render={(daily) => <DailyRecipeWidget daily={daily} />}
          />
        </Suspense>
        <Suspense fallback={<WidgetSkeleton title="Mails" />}>
          <WidgetSlot
            title="Mails"
            connector={mailConnector}
            userId={data.user.id}
            render={(mail) => <MailWidget mail={mail} />}
          />
        </Suspense>
        <Suspense fallback={<WidgetSkeleton title="Sommeil" />}>
          <WidgetSlot
            title="Sommeil"
            connector={sleepConnector}
            userId={data.user.id}
            render={(sleep) => <SleepWidget sleep={sleep} />}
          />
        </Suspense>
        <Suspense fallback={<WidgetSkeleton title="Activités" />}>
          <WidgetSlot
            title="Activités"
            connector={activitiesConnector}
            userId={data.user.id}
            render={(activities) => <ActivitiesWidget activities={activities} />}
          />
        </Suspense>
        <Suspense fallback={<WidgetSkeleton title="7 derniers jours" />}>
          <WidgetSlot
            title="7 derniers jours"
            connector={trendConnector}
            userId={data.user.id}
            render={(trend) => <TrendWidget trend={trend} />}
          />
        </Suspense>
      </div>
    </main>
  )
}
