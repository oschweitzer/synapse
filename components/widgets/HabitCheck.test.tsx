// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { setHabitDone } from '@/app/actions/mood'
import { HabitCheck } from './HabitCheck'

vi.mock('@/app/actions/mood', () => ({ setHabitDone: vi.fn() }))

describe('HabitCheck', () => {
  it('coche la case selon done et affiche le nom', () => {
    render(
      <>
        <HabitCheck id="h1" name="Méditer" done />
        <HabitCheck id="h2" name="Lire" done={false} />
      </>,
    )
    expect(screen.getByRole('checkbox', { name: 'Méditer' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Lire' })).not.toBeChecked()
  })

  it('cocher appelle setHabitDone(id, true) et la case reste cochée', async () => {
    vi.mocked(setHabitDone).mockResolvedValue({})
    render(<HabitCheck id="h1" name="Méditer" done={false} />)
    const box = screen.getByRole('checkbox', { name: 'Méditer' })
    await userEvent.setup().click(box)
    expect(setHabitDone).toHaveBeenCalledWith('h1', true)
    expect(box).toBeChecked()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('échec: case remise à l’état précédent, erreur en role="alert"', async () => {
    vi.mocked(setHabitDone).mockResolvedValue({ error: 'Habitude inconnue.' })
    render(<HabitCheck id="h1" name="Méditer" done={false} />)
    const box = screen.getByRole('checkbox', { name: 'Méditer' })
    await userEvent.setup().click(box)
    expect(await screen.findByRole('alert')).toHaveTextContent('Habitude inconnue.')
    expect(box).not.toBeChecked()
  })
})
