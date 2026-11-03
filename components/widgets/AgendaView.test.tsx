// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { AgendaView } from './AgendaView'

const data = { todayKey: '2026-11-04', firstMonth: '2026-10', lastMonth: '2026-12', events: [] }

describe('AgendaView', () => {
  it('affiche la liste par défaut', () => {
    render(<AgendaView list={<p>Liste factice</p>} month={data} />)
    expect(screen.getByRole('group', { name: 'Vue de l’agenda' })).toBeInTheDocument()
    expect(screen.getByText('Liste factice')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Liste' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Mois' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByRole('grid')).not.toBeInTheDocument()
  })

  it('« Mois » affiche la grille à la place de la liste', async () => {
    render(<AgendaView list={<p>Liste factice</p>} month={data} />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Mois' }))
    expect(screen.getByRole('grid')).toBeInTheDocument()
    expect(screen.queryByText('Liste factice')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mois' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Liste' })).toHaveAttribute('aria-pressed', 'false')
  })
})
