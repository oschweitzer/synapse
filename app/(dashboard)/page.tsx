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
import { SortableDashboard, type DashboardItem } from '@/components/dashboard/SortableDashboard'
import type { WidgetId } from '@/lib/dashboard'
import { listDashboards } from '@/lib/dashboards'
import { readLockState } from '@/lib/lock/page'
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
import { AutoLock } from '@/components/lock/AutoLock'
import { pickerConfig } from '@/lib/google/oauth'
import { TIME_ZONE, dayKey } from '@/lib/time'

function formatTopbar(now: Date) {
  const date = now.toLocaleDateString('fr-FR', { timeZone: TIME_ZONE, weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })
  const time = now.toLocaleTimeString('fr-FR', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit' })
  return `${date} · ${time}`.toUpperCase()
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ d?: string }> }) {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (!data.user) redirect('/login')

  const { d } = await searchParams

  // Le middleware laisse passer cette page verrouillée : un dashboard privé n'est servi (ni rendu,
  // ni ses données lues) qu'une fois déverrouillé. Toute erreur de lecture reste fermée.
  const [dashboards, lock] = await Promise.all([
    listDashboards(supabase).catch((e) => {
      console.error('[dashboard] lecture des dashboards', e)
      return null
    }),
    readLockState(supabase, data.user.id).catch((e) => {
      console.error('[dashboard] lecture du verrouillage', e)
      return null
    }),
  ])
  if (!lock) redirect('/unlock')
  if (!dashboards) {
    return (
      <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-4">
        <p role="alert" className="border border-danger bg-danger-wash px-3 py-2 text-sm text-danger">
          Impossible de lire les dashboards. Réessaie dans un instant.
        </p>
      </main>
    )
  }
  const current = dashboards.find((x) => x.id === d) ?? dashboards.find((x) => x.isDefault) ?? dashboards[0]
  if (current.visibility === 'private' && !lock.unlocked) {
    redirect(`/unlock?next=${encodeURIComponent(current.isDefault && !d ? '/' : `/?d=${current.id}`)}`)
  }

  const widgets: Record<WidgetId, DashboardItem> = {
    activities: {
      id: 'activities',
      title: 'Activités',
      span: 8,
      node: (
        <Suspense fallback={<WidgetSkeleton title="Activités" index="auto" icon="run" span={8} hero />}>
          <WidgetSlot
            refreshId="activities"
            title="Activités"
            index="auto" icon="run" span={8} hero
            connector={activitiesConnector}
            userId={data.user.id}
            render={(activities) => <ActivitiesWidget activities={activities} />}
          />
        </Suspense>
      ),
    },
    mail: {
      id: 'mail',
      title: 'Mails',
      span: 4,
      node: (
        <Suspense fallback={<WidgetSkeleton title="Mails" index="auto" icon="mail" span={4} />}>
          <WidgetSlot
            refreshId="mail"
            title="Mails"
            index="auto" icon="mail" span={4}
            connector={mailConnector}
            userId={data.user.id}
            render={(mail) => <MailWidget mail={mail} />}
          />
        </Suspense>
      ),
    },
    trend: {
      id: 'trend',
      title: '7 derniers jours',
      span: 8,
      node: (
        <Suspense fallback={<WidgetSkeleton title="7 derniers jours" index="auto" icon="run" span={8} />}>
          <WidgetSlot
            refreshId="trend"
            title="7 derniers jours"
            index="auto" icon="run" span={8}
            connector={trendConnector}
            userId={data.user.id}
            render={(trend) => <TrendWidget trend={trend} />}
          />
        </Suspense>
      ),
    },
    sleep: {
      id: 'sleep',
      title: 'Sommeil',
      span: 4,
      node: (
        <Suspense fallback={<WidgetSkeleton title="Sommeil" index="auto" icon="moon" span={4} />}>
          <WidgetSlot
            refreshId="sleep"
            title="Sommeil"
            index="auto" icon="moon" span={4}
            connector={sleepConnector}
            userId={data.user.id}
            render={(sleep) => <SleepWidget sleep={sleep} />}
          />
        </Suspense>
      ),
    },
    cash: {
      id: 'cash',
      title: 'Dépenses cash',
      span: 8,
      node: (
        <Suspense fallback={<WidgetSkeleton title="Dépenses cash" index="auto" icon="wallet" span={8} />}>
          <WidgetSlot
            refreshId="cash"
            title="Dépenses cash"
            index="auto" icon="wallet" span={8}
            connector={cashConnector}
            userId={data.user.id}
            render={(cash) => <CashWidget cash={cash} picker={pickerConfig()} today={dayKey(new Date())} />}
          />
        </Suspense>
      ),
    },
    todo: {
      id: 'todo',
      title: 'À faire',
      span: 4,
      node: (
        <Suspense fallback={<WidgetSkeleton title="À faire" index="auto" icon="task" span={4} />}>
          <WidgetSlot
            refreshId="todo"
            title="À faire"
            index="auto" icon="task" span={4}
            connector={todoConnector}
            userId={data.user.id}
            render={(todo) => <TodoWidget todo={todo} />}
          />
        </Suspense>
      ),
    },
    shopping: {
      id: 'shopping',
      title: 'Courses',
      span: 4,
      node: (
        <Suspense fallback={<WidgetSkeleton title="Courses" index="auto" icon="cart" span={4} />}>
          <WidgetSlot
            refreshId="shopping"
            title="Courses"
            index="auto" icon="cart" span={4}
            connector={shoppingConnector}
            userId={data.user.id}
            render={(shopping) => <ShoppingWidget shopping={shopping} />}
          />
        </Suspense>
      ),
    },
    agenda: {
      id: 'agenda',
      title: 'Agenda',
      span: 4,
      node: (
        <Suspense fallback={<WidgetSkeleton title="Agenda" index="auto" icon="grid" span={4} />}>
          <WidgetSlot
            refreshId="agenda"
            title="Agenda"
            index="auto" icon="grid" span={4}
            connector={agendaConnector}
            userId={data.user.id}
            render={(agenda) => <AgendaWidget agenda={agenda} />}
          />
        </Suspense>
      ),
    },
    weather: {
      id: 'weather',
      title: 'Météo',
      span: 4,
      node: (
        <Suspense fallback={<WidgetSkeleton title="Météo" index="auto" icon="grid" span={4} />}>
          <WidgetSlot
            refreshId="weather"
            title="Météo"
            index="auto" icon="grid" span={4}
            connector={weatherConnector}
            userId={data.user.id}
            render={(cities) => <WeatherWidget cities={cities} />}
          />
        </Suspense>
      ),
    },
    mood: {
      id: 'mood',
      title: 'Humeur',
      span: 4,
      node: (
        <Suspense fallback={<WidgetSkeleton title="Humeur" index="auto" icon="heart" span={4} />}>
          <WidgetSlot
            refreshId="mood"
            title="Humeur"
            index="auto" icon="heart" span={4}
            connector={moodConnector}
            userId={data.user.id}
            render={(mood) => <MoodWidget mood={mood} />}
          />
        </Suspense>
      ),
    },
    habits: {
      id: 'habits',
      title: 'Habitudes',
      span: 4,
      node: (
        <Suspense fallback={<WidgetSkeleton title="Habitudes" index="auto" icon="check" span={4} />}>
          <WidgetSlot
            refreshId="habits"
            title="Habitudes"
            index="auto" icon="check" span={4}
            connector={habitsConnector}
            userId={data.user.id}
            render={(habits) => <HabitsWidget habits={habits} />}
          />
        </Suspense>
      ),
    },
    'daily-recipe': {
      id: 'daily-recipe',
      title: 'Recette du jour',
      span: 4,
      node: (
        <Suspense fallback={<WidgetSkeleton title="Recette du jour" index="auto" icon="cart" span={4} />}>
          <WidgetSlot
            refreshId="daily-recipe"
            title="Recette du jour"
            index="auto" icon="cart" span={4}
            connector={dailyRecipeConnector}
            userId={data.user.id}
            render={(daily) => <DailyRecipeWidget daily={daily} />}
          />
        </Suspense>
      ),
    },
  }
  const items = current.widgets.map((id) => widgets[id])

  return (
    <main>
      {lock.config && lock.unlocked && <AutoLock idleMinutes={lock.config.idleMinutes} />}
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
          <Link href="/mindmaps" className={buttonClass({ size: 'sm' })}>
            Mind maps
          </Link>
          <Link href="/settings" className={buttonClass({ size: 'sm' })}>
            Réglages
          </Link>
          {lock.config && lock.unlocked && (
            <form action="/api/lock/lock" method="post">
              <button type="submit" className={buttonClass({ variant: 'quiet', size: 'sm' })}>
                Verrouiller
              </button>
            </form>
          )}
          {lock.config && !lock.unlocked && (
            <Link href={`/unlock?next=${encodeURIComponent(`/?d=${current.id}`)}`} className={buttonClass({ size: 'sm' })}>
              Déverrouiller
            </Link>
          )}
          <form action="/auth/signout" method="post">
            <button type="submit" className={buttonClass({ variant: 'quiet', size: 'sm' })}>
              Se déconnecter
            </button>
          </form>
        </nav>
      </header>
      {dashboards.length > 1 && (
        <nav aria-label="Dashboards" className="hud-row px-8 pt-4 max-[900px]:px-4">
          {dashboards.map((x) => (
            <Link
              key={x.id}
              href={x.isDefault ? '/' : `/?d=${x.id}`}
              aria-current={x.id === current.id ? 'page' : undefined}
              className={buttonClass({ size: 'sm', variant: x.id === current.id ? 'primary' : 'quiet' })}
            >
              {x.name}
              {x.visibility === 'private' && <span className="sr-only"> (privé)</span>}
            </Link>
          ))}
        </nav>
      )}
      <div className="px-8 pt-4 max-[900px]:px-4">
      <Suspense fallback={null}>
        <GoogleReauthBanner />
      </Suspense>
      </div>
      <SortableDashboard key={current.id} dashboardId={current.id} items={items} />
    </main>
  )
}
