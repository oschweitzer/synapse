import type { CalendarEvent } from '@/lib/connectors/google'
import { TIME_ZONE } from '@/lib/time'

export const muted = 'text-slate-500 dark:text-slate-400'

export function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('fr-FR', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit' })
}

export function formatDay(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'short' })
}

export function EventLine({ event }: { event: CalendarEvent }) {
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
