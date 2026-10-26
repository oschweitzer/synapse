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
import { buttonClass } from '@/components/ui/Button'
import { pickerConfig } from '@/lib/google/oauth'
import { TIME_ZONE, dayKey } from '@/lib/time'

function formatTopbar(now: Date) {
  const date = now.toLocaleDateString('fr-FR', { timeZone: TIME_ZONE, weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })
  const time = now.toLocaleTimeString('fr-FR', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit' })
  return `${date} · ${time}`.toUpperCase()
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (!data.user) redirect('/login')

  return (
    <main>
      <header className="hud-topbar">
        <div>
          <h1 className="hud-topbar__title">Synapse</h1>
          <p className="hud-topbar__sub">{formatTopbar(new Date())}</p>
        </div>
        <nav aria-label="Navigation" className="hud-row">
          <Link href="/recipes" className={buttonClass({ size: 'sm' })}>
            Recettes
          </Link>
          <Link href="/cash" className={buttonClass({ size: 'sm' })}>
            Dépenses
          </Link>
          <Link href="/settings" className={buttonClass({ size: 'sm' })}>
            Réglages
          </Link>
          <form action="/auth/signout" method="post">
            <button type="submit" className={buttonClass({ variant: 'quiet', size: 'sm' })}>
              Se déconnecter
            </button>
          </form>
        </nav>
      </header>
      <div className="px-8 pt-4 max-[900px]:px-4">
      <Suspense fallback={null}>
        <GoogleReauthBanner />
      </Suspense>
      </div>
      <div className="hud-dash">
        <Suspense fallback={<WidgetSkeleton title="Activités" index={1} icon="run" span={8} hero />}>
          <WidgetSlot
            title="Activités"
            index={1} icon="run" span={8} hero
            connector={activitiesConnector}
            userId={data.user.id}
            render={(activities) => <ActivitiesWidget activities={activities} />}
          />
        </Suspense>
        <Suspense fallback={<WidgetSkeleton title="Mails" index={2} icon="mail" />}>
          <WidgetSlot
            title="Mails"
            index={2} icon="mail"
            connector={mailConnector}
            userId={data.user.id}
            render={(mail) => <MailWidget mail={mail} />}
          />
        </Suspense>
        <Suspense fallback={<WidgetSkeleton title="7 derniers jours" index={3} icon="run" span={8} />}>
          <WidgetSlot
            title="7 derniers jours"
            index={3} icon="run" span={8}
            connector={trendConnector}
            userId={data.user.id}
            render={(trend) => <TrendWidget trend={trend} />}
          />
        </Suspense>
        <Suspense fallback={<WidgetSkeleton title="Sommeil" index={4} icon="moon" />}>
          <WidgetSlot
            title="Sommeil"
            index={4} icon="moon"
            connector={sleepConnector}
            userId={data.user.id}
            render={(sleep) => <SleepWidget sleep={sleep} />}
          />
        </Suspense>
        <Suspense fallback={<WidgetSkeleton title="Dépenses cash" index={5} icon="wallet" span={8} />}>
          <WidgetSlot
            title="Dépenses cash"
            index={5} icon="wallet" span={8}
            connector={cashConnector}
            userId={data.user.id}
            render={(cash) => <CashWidget cash={cash} picker={pickerConfig()} today={dayKey(new Date())} />}
          />
        </Suspense>
        <Suspense fallback={<WidgetSkeleton title="À faire" index={6} icon="task" span={4} />}>
          <WidgetSlot
            title="À faire"
            index={6} icon="task" span={4}
            connector={todoConnector}
            userId={data.user.id}
            render={(todo) => <TodoWidget todo={todo} />}
          />
        </Suspense>
        <Suspense fallback={<WidgetSkeleton title="Courses" index={7} icon="cart" />}>
          <WidgetSlot
            title="Courses"
            index={7} icon="cart"
            connector={shoppingConnector}
            userId={data.user.id}
            render={(shopping) => <ShoppingWidget shopping={shopping} />}
          />
        </Suspense>
        <Suspense fallback={<WidgetSkeleton title="Agenda" index={8} icon="grid" />}>
          <WidgetSlot
            title="Agenda"
            index={8} icon="grid"
            connector={agendaConnector}
            userId={data.user.id}
            render={(agenda) => <AgendaWidget agenda={agenda} />}
          />
        </Suspense>
        <Suspense fallback={<WidgetSkeleton title="Météo" index={9} icon="grid" />}>
          <WidgetSlot
            title="Météo"
            index={9} icon="grid"
            connector={weatherConnector}
            userId={data.user.id}
            render={(weather) => weather && <WeatherWidget weather={weather} />}
          />
        </Suspense>
        <Suspense fallback={<WidgetSkeleton title="Humeur" index={10} icon="heart" />}>
          <WidgetSlot
            title="Humeur"
            index={10} icon="heart"
            connector={moodConnector}
            userId={data.user.id}
            render={(mood) => <MoodWidget mood={mood} />}
          />
        </Suspense>
        <Suspense fallback={<WidgetSkeleton title="Habitudes" index={11} icon="check" />}>
          <WidgetSlot
            title="Habitudes"
            index={11} icon="check"
            connector={habitsConnector}
            userId={data.user.id}
            render={(habits) => <HabitsWidget habits={habits} />}
          />
        </Suspense>
        <Suspense fallback={<WidgetSkeleton title="Recette du jour" index={12} icon="cart" />}>
          <WidgetSlot
            title="Recette du jour"
            index={12} icon="cart"
            connector={dailyRecipeConnector}
            userId={data.user.id}
            render={(daily) => <DailyRecipeWidget daily={daily} />}
          />
        </Suspense>
      </div>
    </main>
  )
}
