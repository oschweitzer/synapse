// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { AgendaMonth as AgendaMonthData, CalendarEvent } from '@/lib/connectors/google'
import { AgendaMonth } from './AgendaMonth'

let seq = 0
const event = (over: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id: `cal/e${++seq}`,
  title: 'Réunion',
  location: null,
  allDay: false,
  startAt: '2026-11-15T14:00:00Z',
  endAt: '2026-11-15T15:00:00Z',
  htmlLink: null,
  color: null,
  isPast: false,
  ...over,
})

const month = (events: CalendarEvent[] = []): AgendaMonthData => ({
  todayKey: '2026-11-04',
  firstMonth: '2026-10',
  lastMonth: '2026-12',
  events,
})

const day = (name: RegExp) => screen.getByRole('button', { name })

describe('AgendaMonth', () => {
  it('affiche 42 jours, l’en-tête lun. et le titre du mois', () => {
    render(<AgendaMonth data={month()} />)
    expect(within(screen.getByRole('grid')).getAllByRole('button')).toHaveLength(42)
    const first = screen.getAllByRole('columnheader')[0]
    expect(first).toHaveTextContent('lun.')
    expect(first.querySelector('abbr')).toHaveAttribute('title', 'lundi')
    expect(screen.getByRole('heading', { name: 'novembre 2026' })).toBeInTheDocument()
  })

  it('marque aujourd’hui comme date courante et sélectionnée', () => {
    render(<AgendaMonth data={month()} />)
    const today = day(/^mercredi 4 novembre/)
    expect(today).toHaveAttribute('aria-current', 'date')
    expect(today).toHaveAttribute('aria-pressed', 'true')
  })

  it('liste les évènements du jour cliqué, ou dit que rien n’est prévu', async () => {
    const user = userEvent.setup()
    render(
      <AgendaMonth
        data={month([
          event({
            title: 'Dentiste',
            startAt: '2026-11-05T09:00:00Z',
            endAt: '2026-11-05T10:00:00Z',
            htmlLink: 'https://calendar.google.com/e/1',
          }),
        ])}
      />,
    )
    await user.click(day(/^jeudi 5 novembre, 1 évènement$/))
    expect(within(screen.getByRole('list')).getByRole('link', { name: 'Dentiste' })).toBeInTheDocument()

    await user.click(day(/^vendredi 6 novembre, aucun évènement$/))
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
    expect(screen.getByText('Rien de prévu ce jour-là.')).toBeInTheDocument()
  })

  it('indique +N au-delà de la limite de chips et de points', () => {
    const events = [1, 2, 3, 4].map((i) =>
      event({
        title: `E${i}`,
        startAt: `2026-11-10T0${i}:00:00Z`,
        endAt: `2026-11-10T0${i}:30:00Z`,
        color: { background: '#1e3a8a', foreground: null },
      }),
    )
    render(<AgendaMonth data={month(events)} />)
    const cell = day(/^mardi 10 novembre, 4 évènements$/)
    expect(cell).toHaveTextContent('+2')
    expect(cell).toHaveTextContent('+1')
  })

  it('affiche un évènement multi-jours sur chaque jour couvert', () => {
    render(
      <AgendaMonth
        data={month([
          event({ allDay: true, startAt: '2026-11-09T00:00:00Z', endAt: '2026-11-12T00:00:00Z' }),
        ])}
      />,
    )
    expect(day(/^lundi 9 novembre, 1 évènement$/)).toBeInTheDocument()
    expect(day(/^mardi 10 novembre, 1 évènement$/)).toBeInTheDocument()
    expect(day(/^mercredi 11 novembre, 1 évènement$/)).toBeInTheDocument()
    expect(day(/^jeudi 12 novembre, aucun évènement$/)).toBeInTheDocument()
  })

  it('limite la navigation au mois précédent et au mois suivant', async () => {
    const user = userEvent.setup()
    render(<AgendaMonth data={month()} />)
    const prev = screen.getByRole('button', { name: 'Mois précédent' })
    const next = screen.getByRole('button', { name: 'Mois suivant' })
    expect(prev).toBeEnabled()
    await user.click(prev)
    expect(screen.getByRole('heading', { name: 'octobre 2026' })).toBeInTheDocument()
    expect(prev).toBeDisabled()
    await user.click(next)
    await user.click(next)
    expect(screen.getByRole('heading', { name: 'décembre 2026' })).toBeInTheDocument()
    expect(next).toBeDisabled()
  })

  it('« Aujourd’hui » revient au mois courant avec aujourd’hui sélectionné', async () => {
    const user = userEvent.setup()
    render(<AgendaMonth data={month()} />)
    await user.click(screen.getByRole('button', { name: 'Mois suivant' }))
    expect(screen.getByRole('heading', { name: 'décembre 2026' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Aujourd’hui' }))
    expect(screen.getByRole('heading', { name: 'novembre 2026' })).toBeInTheDocument()
    expect(day(/^mercredi 4 novembre/)).toHaveAttribute('aria-pressed', 'true')
  })

  it('les flèches déplacent le focus d’un jour ou d’une semaine', async () => {
    const user = userEvent.setup()
    render(<AgendaMonth data={month()} />)
    await user.click(day(/^mercredi 4 novembre/))
    await user.keyboard('{ArrowRight}')
    expect(day(/^jeudi 5 novembre/)).toHaveFocus()
    await user.keyboard('{ArrowDown}')
    expect(day(/^jeudi 12 novembre/)).toHaveFocus()
  })

  it('une flèche avec un modificateur ne déplace pas le focus', async () => {
    const user = userEvent.setup()
    render(<AgendaMonth data={month()} />)
    const start = day(/^mercredi 4 novembre/)
    await user.click(start)
    for (const modifier of ['Alt', 'Control', 'Meta', 'Shift']) {
      await user.keyboard(`{${modifier}>}{ArrowRight}{/${modifier}}`)
      expect(start).toHaveFocus()
    }
  })
})
