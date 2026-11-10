// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { updateChecklistItemContent } from '@/app/actions/cairn'
import { ItemText } from './ItemText'

vi.mock('@/app/actions/cairn', () => ({ updateChecklistItemContent: vi.fn() }))

beforeEach(() => vi.clearAllMocks())

async function edit() {
  const user = userEvent.setup()
  render(<ItemText id="i1" content="Pain" />)
  await user.click(screen.getByRole('button', { name: 'Modifier « Pain »' }))
  const input = screen.getByRole('textbox', { name: 'Modifier « Pain »' })
  return { user, input }
}

describe('ItemText', () => {
  it('le crayon transforme le texte en champ prérempli', async () => {
    const { input } = await edit()
    expect(input).toHaveValue('Pain')
    expect(input).toHaveFocus()
  })

  it('cliquer sur le texte ouvre aussi l’édition', async () => {
    render(<ItemText id="i1" content="Pain" />)
    await userEvent.setup().click(screen.getByText('Pain'))
    expect(screen.getByRole('textbox', { name: 'Modifier « Pain »' })).toBeInTheDocument()
  })

  it('un clic avec du texte sélectionné n’ouvre pas l’édition', async () => {
    render(<ItemText id="i1" content="Pain" />)
    const text = screen.getByText('Pain')
    const range = document.createRange()
    range.selectNodeContents(text)
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(range)
    fireEvent.click(text)
    expect(screen.queryByRole('textbox')).toBeNull()
    window.getSelection()?.removeAllRanges()
  })

  it('Entrée pendant une composition IME n’enregistre pas', async () => {
    vi.mocked(updateChecklistItemContent).mockResolvedValue({})
    const { input } = await edit()
    fireEvent.change(input, { target: { value: 'Baguette' } })
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true })
    expect(updateChecklistItemContent).not.toHaveBeenCalled()
    expect(screen.getByRole('textbox')).toBeInTheDocument()
  })

  it('Entrée enregistre le texte rogné et l’affiche tout de suite', async () => {
    vi.mocked(updateChecklistItemContent).mockResolvedValue({})
    const { user, input } = await edit()
    await user.clear(input)
    await user.type(input, '  Pain complet {Enter}')
    expect(updateChecklistItemContent).toHaveBeenCalledTimes(1)
    expect(updateChecklistItemContent).toHaveBeenCalledWith('i1', 'Pain complet')
    expect(screen.getByText('Pain complet')).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('Échap restaure le texte sans appeler l’action', async () => {
    const { user, input } = await edit()
    await user.clear(input)
    await user.type(input, 'Autre{Escape}')
    expect(updateChecklistItemContent).not.toHaveBeenCalled()
    expect(screen.getByText('Pain')).toBeInTheDocument()
  })

  it('la perte de focus enregistre', async () => {
    vi.mocked(updateChecklistItemContent).mockResolvedValue({})
    const { user, input } = await edit()
    await user.clear(input)
    await user.type(input, 'Baguette')
    await user.tab()
    expect(updateChecklistItemContent).toHaveBeenCalledWith('i1', 'Baguette')
    expect(screen.getByText('Baguette')).toBeInTheDocument()
  })

  it('un texte inchangé n’appelle pas l’action', async () => {
    const { user } = await edit()
    await user.tab()
    expect(updateChecklistItemContent).not.toHaveBeenCalled()
    expect(screen.getByText('Pain')).toBeInTheDocument()
  })

  it('un texte vide affiche une erreur et reste en édition', async () => {
    const { user, input } = await edit()
    await user.clear(input)
    await user.type(input, '{Enter}')
    expect(await screen.findByRole('alert')).toHaveTextContent('Le texte est vide.')
    expect(screen.getByRole('textbox')).toBeInTheDocument()
    expect(updateChecklistItemContent).not.toHaveBeenCalled()
  })

  it('une erreur serveur rétablit le texte et s’affiche en alerte', async () => {
    vi.mocked(updateChecklistItemContent).mockResolvedValue({ error: 'Impossible de mettre à jour Cairn.' })
    const { user, input } = await edit()
    await user.clear(input)
    await user.type(input, 'Autre{Enter}')
    expect(await screen.findByRole('alert')).toHaveTextContent('Impossible de mettre à jour Cairn.')
    expect(screen.getByText('Pain')).toBeInTheDocument()
  })
})
