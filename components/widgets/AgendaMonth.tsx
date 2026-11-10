'use client'

import { useCallback, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import type { AgendaMonth as AgendaMonthData, CalendarEvent } from '@/lib/connectors/google'
import { addDays, eventsByDay, monthGrid, readableText, shiftMonth } from '@/lib/agenda-month'
import { EventLine, formatDay, muted } from './AgendaEvent'

const WEEKDAYS = [
  ['lun.', 'lundi'],
  ['mar.', 'mardi'],
  ['mer.', 'mercredi'],
  ['jeu.', 'jeudi'],
  ['ven.', 'vendredi'],
  ['sam.', 'samedi'],
  ['dim.', 'dimanche'],
] as const

const ARROWS: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }

// Midi UTC : aucune dérive de fuseau possible, serveur et client rendent pareil.
const label = (key: string, options: Intl.DateTimeFormatOptions) =>
  new Date(`${key}T12:00:00Z`).toLocaleDateString('fr-FR', { timeZone: 'UTC', ...options })

const countText = (n: number) => (n === 0 ? 'aucun évènement' : n === 1 ? '1 évènement' : `${n} évènements`)

const FALLBACK_DOT = 'bg-slate-400 dark:bg-slate-500'
const FALLBACK_CHIP = 'bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-100'

function Dot({ event }: { event: CalendarEvent }) {
  const { color } = event
  return (
    <span
      className={`h-1.5 w-1.5 rounded-full ${color ? '' : FALLBACK_DOT}`}
      style={color ? { backgroundColor: color.background } : undefined}
    />
  )
}

function Chip({ event }: { event: CalendarEvent }) {
  const { color } = event
  return (
    <span
      className={`truncate rounded-sm px-1 text-[10px] leading-4 ${color ? '' : FALLBACK_CHIP}`}
      style={
        color
          ? { backgroundColor: color.background, color: color.foreground ?? readableText(color.background) }
          : undefined
      }
    >
      {event.title}
    </span>
  )
}

export function AgendaMonth({ data }: { data: AgendaMonthData }) {
  // Jamais `new Date()` : `todayKey` vient du serveur, pas de décalage d'hydratation.
  const [month, setMonth] = useState(data.todayKey.slice(0, 7))
  const [selected, setSelected] = useState(data.todayKey)
  const titleId = useId()
  const buttons = useRef(new Map<string, HTMLButtonElement>())
  const byDay = useMemo(() => eventsByDay(data.events), [data.events])
  const weeks = useMemo(() => monthGrid(month), [month])
  // Un seul ref callback pour les 42 jours (clé lue dans data-day) : React ne le rappelle pas à chaque rendu.
  const registerDay = useCallback((el: HTMLButtonElement | null) => {
    const key = el?.dataset.day
    if (!el || !key) return
    buttons.current.set(key, el)
    return () => {
      buttons.current.delete(key)
    }
  }, [])

  const goTo = (target: string) => {
    setMonth(target)
    // Le jour sélectionné porte le tabstop : il doit toujours être dans la grille visible.
    setSelected(data.todayKey.startsWith(target) ? data.todayKey : `${target}-01`)
  }

  const onKeyDown = (key: string) => (e: KeyboardEvent<HTMLButtonElement>) => {
    // Laisse passer les raccourcis du navigateur (Alt+←, etc.).
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
    const delta = ARROWS[e.key]
    if (delta === undefined) return
    const target = buttons.current.get(addDays(key, delta))
    if (!target) return
    e.preventDefault()
    target.focus()
  }

  const selectedEvents = byDay[selected] ?? []
  const selectedLabel = formatDay(`${selected}T12:00:00Z`)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-1">
        <h3 id={titleId} aria-live="polite" className="flex-1 text-sm font-semibold">
          {label(`${month}-01`, { month: 'long', year: 'numeric' })}
        </h3>
        <button
          type="button"
          aria-label="Mois précédent"
          title="Mois précédent"
          disabled={month === data.firstMonth}
          onClick={() => goTo(shiftMonth(month, -1))}
          className="hud-btn hud-btn--sm hud-btn--ghost"
        >
          ‹
        </button>
        <button
          type="button"
          onClick={() => goTo(data.todayKey.slice(0, 7))}
          className="hud-btn hud-btn--sm hud-btn--ghost"
        >
          Aujourd’hui
        </button>
        <button
          type="button"
          aria-label="Mois suivant"
          title="Mois suivant"
          disabled={month === data.lastMonth}
          onClick={() => goTo(shiftMonth(month, 1))}
          className="hud-btn hud-btn--sm hud-btn--ghost"
        >
          ›
        </button>
      </div>

      <div role="grid" aria-labelledby={titleId} className="flex flex-col gap-px">
        <div role="row" className="grid grid-cols-7">
          {WEEKDAYS.map(([short, long]) => (
            <div key={long} role="columnheader" className={`text-center text-xs ${muted}`}>
              <abbr title={long}>{short}</abbr>
            </div>
          ))}
        </div>
        {weeks.map((week) => (
          <div key={week[0].key} role="row" className="grid grid-cols-7 gap-px">
            {week.map(({ key, inMonth }) => {
              const events = byDay[key] ?? []
              return (
                <div key={key} role="gridcell" className="min-w-0">
                  <button
                    type="button"
                    ref={registerDay}
                    data-day={key}
                    aria-label={`${label(key, { weekday: 'long', day: 'numeric', month: 'long' })}, ${countText(events.length)}`}
                    aria-pressed={key === selected}
                    aria-current={key === data.todayKey ? 'date' : undefined}
                    tabIndex={key === selected ? 0 : -1}
                    onClick={() => setSelected(key)}
                    onKeyDown={onKeyDown(key)}
                    className={[
                      'flex h-full min-h-10 w-full min-w-0 flex-col items-stretch gap-0.5 p-0.5 text-left text-xs sm:min-h-16',
                      inMonth ? '' : 'text-slate-400 dark:text-slate-600',
                      key === selected ? 'bg-sky-100 dark:bg-sky-900/40' : '',
                      key === data.todayKey ? 'ring-2 ring-inset ring-sky-500' : '',
                      'focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500',
                    ].join(' ')}
                  >
                    <span aria-hidden="true" className="tabular-nums">
                      {Number(key.slice(8))}
                    </span>
                    <span aria-hidden="true" className="flex flex-wrap items-center gap-0.5 sm:hidden">
                      {events.slice(0, 3).map((event) => (
                        <Dot key={event.id} event={event} />
                      ))}
                      {events.length > 3 && <span>+{events.length - 3}</span>}
                    </span>
                    <span aria-hidden="true" className="hidden min-w-0 flex-col gap-0.5 sm:flex">
                      {events.slice(0, 2).map((event) => (
                        <Chip key={event.id} event={event} />
                      ))}
                      {events.length > 2 && <span>+{events.length - 2}</span>}
                    </span>
                  </button>
                </div>
              )
            })}
          </div>
        ))}
      </div>

      <section className="flex flex-col gap-1">
        <h3 className={`text-xs font-semibold uppercase tracking-wide ${muted}`}>{selectedLabel}</h3>
        {selectedEvents.length === 0 ? (
          <p className={`text-sm ${muted}`}>Rien de prévu ce jour-là.</p>
        ) : (
          <ul className="flex flex-col gap-1" aria-label={selectedLabel}>
            {selectedEvents.map((event) => (
              <EventLine key={event.id} event={event} />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
