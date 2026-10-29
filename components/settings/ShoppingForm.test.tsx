// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { saveShoppingChecklist } from '@/app/actions/cairn'
import { ShoppingForm } from './ShoppingForm'

vi.mock('@/app/actions/cairn', () => ({ saveShoppingChecklist: vi.fn() }))

const CANDIDATES = [
  { id: 'n1', label: 'Courses' },
  { id: 'n2', label: 'Marché' },
]

beforeEach(() => {
  vi.mocked(saveShoppingChecklist).mockReset()
})

describe('ShoppingForm', () => {
  it('présélectionne la checklist enregistrée', () => {
    render(<ShoppingForm candidates={CANDIDATES} current="n1" />)
    expect(screen.getByLabelText('Checklist des courses')).toHaveValue('n1')
  })

  it('garde la checklist choisie et affiche l’erreur quand l’enregistrement échoue', async () => {
    vi.mocked(saveShoppingChecklist).mockResolvedValue({ code: 'save', at: 1, noteId: 'n2' })
    render(<ShoppingForm candidates={CANDIDATES} current="n1" />)
    await userEvent.setup().selectOptions(screen.getByLabelText('Checklist des courses'), 'n2')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Enregistrement impossible, réessayez.')
    expect(screen.getByLabelText('Checklist des courses')).toHaveValue('n2')
  })

  it('confirme l’enregistrement', async () => {
    vi.mocked(saveShoppingChecklist).mockResolvedValue({ code: 'saved', at: 2, noteId: 'n2' })
    render(<ShoppingForm candidates={CANDIDATES} current="n1" />)
    await userEvent.setup().selectOptions(screen.getByLabelText('Checklist des courses'), 'n2')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Enregistré.')
    expect(screen.getByLabelText('Checklist des courses')).toHaveValue('n2')
  })
})
