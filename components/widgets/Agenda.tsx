import type { Agenda, CalendarEvent } from '@/lib/connectors/google'
import { TIME_ZONE } from '@/lib/time'
import { ConnectGoogle } from './GoogleBanner'

const muted = 'text-slate-500 dark:text-slate-400'

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('fr-FR', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit' })
}

function formatDay(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'short' })
}

function EventLine({ event }: { event: CalendarEvent }) {
  const when = event.allDay ? 'Journée' : `${formatTime(event.startAt)} – ${formatTime(event.endAt)}`
  const title = event.htmlLink ? (
    <a href={event.htmlLink} target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:underline">
      {event.title}
    </a>
  ) : (
    event.title
  )

  return (
    <li className={`flex gap-3 text-sm ${event.isPast ? 'text-slate-400 dark:text-slate-500' : ''}`}>
      <span className={`w-24 shrink-0 tabular-nums ${event.isPast ? '' : muted}`}>{when}</span>
      <span className="min-w-0 flex-1 break-words">
        {event.color && (
          <span
            aria-hidden="true"
            className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle ring-1 ring-slate-900/15 dark:ring-white/25"
            style={{ backgroundColor: event.color.background }}
          />
        )}
        {title}
        {event.location && <span className={`block text-xs ${muted}`}>{event.location}</span>}
      </span>
    </li>
  )
}

export function AgendaWidget({ agenda }: { agenda: Agenda }) {
  if (agenda.status === 'disconnected') return <ConnectGoogle what="ton agenda" />

  return (
    <div className="flex flex-col gap-4">
      {agenda.today.length === 0 ? (
        <p className={`text-sm ${muted}`}>Rien de prévu aujourd’hui.</p>
      ) : (
        <ul className="flex flex-col gap-2" aria-label="Aujourd’hui">
          {agenda.today.map((event) => (
            <EventLine key={event.id} event={event} />
          ))}
        </ul>
      )}

      {agenda.upcoming.map((day) => (
        <div key={day.key} className="flex flex-col gap-1">
          <h3 className={`text-xs font-semibold uppercase tracking-wide ${muted}`}>{formatDay(day.date)}</h3>
          <ul className="flex flex-col gap-1" aria-label={formatDay(day.date)}>
            {day.events.map((event) => (
              <EventLine key={event.id} event={event} />
            ))}
          </ul>
        </div>
      ))}
      {agenda.moreCount > 0 && <p className={`text-xs ${muted}`}>… et {agenda.moreCount} autres cette semaine</p>}
    </div>
  )
}
