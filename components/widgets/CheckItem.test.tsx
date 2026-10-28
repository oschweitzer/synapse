// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { setChecklistItemDone } from '@/app/actions/cairn'
import { CheckItem } from './CheckItem'

vi.mock('@/app/actions/cairn', () => ({ setChecklistItemDone: vi.fn() }))

function renderItem() {
  return render(
    <ul>
      <CheckItem id="i1" label="Acheter du pain">
        <span>Pain complet</span>
      </CheckItem>
    </ul>,
  )
}

describe('CheckItem', () => {
  it('case non cochée au départ, aria-label = label, enfants rendus', () => {
    renderItem()
    expect(screen.getByRole('checkbox', { name: 'Acheter du pain' })).not.toBeChecked()
    expect(screen.getByText('Pain complet')).toBeInTheDocument()
  })

  it('cocher appelle setChecklistItemDone(id, true) et barre le texte', async () => {
    vi.mocked(setChecklistItemDone).mockResolvedValue({})
    renderItem()
    await userEvent.setup().click(screen.getByRole('checkbox', { name: 'Acheter du pain' }))
    expect(setChecklistItemDone).toHaveBeenCalledWith('i1', true)
    expect(screen.getByRole('checkbox', { name: 'Acheter du pain' })).toBeChecked()
    expect(screen.getByText('Pain complet').parentElement).toHaveClass('line-through')
  })

  it('échec: case décochée, texte non barré, erreur en role="alert"', async () => {
    vi.mocked(setChecklistItemDone).mockResolvedValue({ error: 'Item inconnu.' })
    renderItem()
    await userEvent.setup().click(screen.getByRole('checkbox', { name: 'Acheter du pain' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Item inconnu.')
    expect(screen.getByRole('checkbox', { name: 'Acheter du pain' })).not.toBeChecked()
    expect(screen.getByText('Pain complet').parentElement).not.toHaveClass('line-through')
  })
})
