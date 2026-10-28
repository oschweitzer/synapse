// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { saveMoodNote, setMood } from '@/app/actions/mood'
import { MOOD_LABELS } from '@/lib/mood'
import { MoodPicker } from './MoodPicker'

vi.mock('@/app/actions/mood', () => ({ setMood: vi.fn(), saveMoodNote: vi.fn() }))

describe('MoodPicker', () => {
  it('sans score: 5 boutons radio non cochés, invite affichée, pas de champ de note', () => {
    render(<MoodPicker score={null} note={null} />)
    const radios = screen.getAllByRole('radio')
    expect(radios).toHaveLength(5)
    radios.forEach((radio) => expect(radio).toHaveAttribute('aria-checked', 'false'))
    expect(screen.getByText('Comment ça va aujourd’hui ?')).toBeInTheDocument()
    expect(screen.queryByLabelText('Un mot sur la journée')).not.toBeInTheDocument()
  })

  it('clic sur une humeur: setMood appelé avec la valeur, radio cochée, champ de note affiché', async () => {
    vi.mocked(setMood).mockResolvedValue({})
    render(<MoodPicker score={null} note={null} />)
    await userEvent.setup().click(screen.getByRole('radio', { name: MOOD_LABELS[4].label }))
    expect(setMood).toHaveBeenCalledWith(4)
    expect(await screen.findByRole('radio', { name: MOOD_LABELS[4].label, checked: true })).toBeInTheDocument()
    expect(screen.getByLabelText('Un mot sur la journée')).toBeInTheDocument()
  })

  it('setMood renvoie { error }: humeur précédente restaurée, erreur en role="alert"', async () => {
    vi.mocked(setMood).mockResolvedValue({ error: 'Humeur inconnue.' })
    render(<MoodPicker score={2} note={null} />)
    await userEvent.setup().click(screen.getByRole('radio', { name: MOOD_LABELS[5].label }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Humeur inconnue.')
    expect(screen.getByRole('radio', { name: MOOD_LABELS[2].label })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: MOOD_LABELS[5].label })).toHaveAttribute('aria-checked', 'false')
  })

  it("note enregistrée: saveMoodNote appelé avec le texte, statut 'Enregistré.'", async () => {
    vi.mocked(saveMoodNote).mockResolvedValue({})
    const user = userEvent.setup()
    render(<MoodPicker score={3} note={null} />)
    await user.type(screen.getByLabelText('Un mot sur la journée'), 'Belle journée')
    await user.click(screen.getByRole('button', { name: 'OK' }))
    expect(saveMoodNote).toHaveBeenCalledWith('Belle journée')
    expect(await screen.findByRole('status')).toHaveTextContent('Enregistré.')
  })

  it('saveMoodNote renvoie { error }: erreur affichée', async () => {
    vi.mocked(saveMoodNote).mockResolvedValue({ error: '500 caractères au plus.' })
    render(<MoodPicker score={3} note="trop long" />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'OK' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('500 caractères au plus.')
  })
})
