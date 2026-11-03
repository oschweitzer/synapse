import type { Agenda } from '@/lib/connectors/google'
import { EventLine, formatDay, muted } from './AgendaEvent'
import { AgendaView } from './AgendaView'
import { ConnectGoogle } from './GoogleBanner'

function AgendaList({ agenda }: { agenda: Extract<Agenda, { status: 'ok' }> }) {
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

export function AgendaWidget({ agenda }: { agenda: Agenda }) {
  if (agenda.status === 'disconnected') return <ConnectGoogle what="ton agenda" />

  return <AgendaView list={<AgendaList agenda={agenda} />} month={agenda.month} />
}
