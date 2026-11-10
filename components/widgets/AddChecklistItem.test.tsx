// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { addChecklistItem } from '@/app/actions/cairn'
import { AddChecklistItem } from './AddChecklistItem'

vi.mock('@/app/actions/cairn', () => ({ addChecklistItem: vi.fn() }))

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const lists = [
  { id: A, label: 'Maison' },
  { id: B, label: 'Travail' },
]

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
})

describe('AddChecklistItem', () => {
  it('Entrée appelle addChecklistItem avec le texte rogné, vide le champ et garde le focus', async () => {
    vi.mocked(addChecklistItem).mockResolvedValue({ id: 'x' })
    render(<AddChecklistItem checklists={[lists[0]]} label="Ajouter un article" />)
    const input = screen.getByRole('textbox', { name: 'Ajouter un article' })
    await userEvent.setup().type(input, '  Beurre {Enter}')
    expect(addChecklistItem).toHaveBeenCalledWith(A, 'Beurre')
    expect(input).toHaveValue('')
    expect(input).toHaveFocus()
  })

  it('un texte d’espaces affiche « Le texte est vide. » sans appeler l’action', async () => {
    render(<AddChecklistItem checklists={[lists[0]]} label="Ajouter un article" />)
    await userEvent.setup().type(screen.getByRole('textbox', { name: 'Ajouter un article' }), '   {Enter}')
    expect(await screen.findByRole('alert')).toHaveTextContent('Le texte est vide.')
    expect(addChecklistItem).not.toHaveBeenCalled()
  })

  it('une erreur serveur s’affiche en alerte et le texte revient dans le champ', async () => {
    vi.mocked(addChecklistItem).mockResolvedValue({ error: 'Impossible d’écrire dans Cairn.' })
    render(<AddChecklistItem checklists={[lists[0]]} label="Ajouter un article" />)
    const input = screen.getByRole('textbox', { name: 'Ajouter un article' })
    await userEvent.setup().type(input, 'Beurre{Enter}')
    expect(await screen.findByRole('alert')).toHaveTextContent('Impossible d’écrire dans Cairn.')
    expect(input).toHaveValue('Beurre')
  })

  it('une erreur serveur ne remplace pas le texte tapé pendant l’attente', async () => {
    let resolve: (r: { error: string }) => void = () => {}
    vi.mocked(addChecklistItem).mockReturnValue(new Promise((r) => (resolve = r)))
    render(<AddChecklistItem checklists={[lists[0]]} label="Ajouter un article" />)
    const user = userEvent.setup()
    const input = screen.getByRole('textbox', { name: 'Ajouter un article' })
    await user.type(input, 'Beurre{Enter}')
    await user.type(input, 'Lait')
    resolve({ error: 'Impossible d’écrire dans Cairn.' })
    expect(await screen.findByRole('alert')).toHaveTextContent('Impossible d’écrire dans Cairn.')
    expect(input).toHaveValue('Lait')
  })

  it('le bouton + envoie aussi le formulaire', async () => {
    vi.mocked(addChecklistItem).mockResolvedValue({ id: 'x' })
    render(<AddChecklistItem checklists={[lists[0]]} label="Ajouter un article" />)
    const user = userEvent.setup()
    await user.type(screen.getByRole('textbox', { name: 'Ajouter un article' }), 'Lait')
    await user.click(screen.getByRole('button', { name: 'Ajouter' }))
    expect(addChecklistItem).toHaveBeenCalledWith(A, 'Lait')
  })

  describe('avec storageKey', () => {
    it('choisit la première checklist par défaut', () => {
      render(<AddChecklistItem checklists={lists} storageKey="k" label="Ajouter un item" />)
      expect(screen.getByRole('combobox', { name: 'Liste' })).toHaveValue(A)
    })

    it('reprend un id mémorisé valide', async () => {
      localStorage.setItem('k', B)
      render(<AddChecklistItem checklists={lists} storageKey="k" label="Ajouter un item" />)
      expect(await screen.findByRole('combobox', { name: 'Liste' })).toHaveValue(B)
    })

    it('ignore un id mémorisé inconnu', async () => {
      localStorage.setItem('k', 'inconnu')
      render(<AddChecklistItem checklists={lists} storageKey="k" label="Ajouter un item" />)
      expect(screen.getByRole('combobox', { name: 'Liste' })).toHaveValue(A)
    })

    it('mémorise le nouveau choix et l’utilise pour l’ajout', async () => {
      vi.mocked(addChecklistItem).mockResolvedValue({ id: 'x' })
      render(<AddChecklistItem checklists={lists} storageKey="k" label="Ajouter un item" />)
      const user = userEvent.setup()
      await user.selectOptions(screen.getByRole('combobox', { name: 'Liste' }), B)
      expect(localStorage.getItem('k')).toBe(B)
      await user.type(screen.getByRole('textbox', { name: 'Ajouter un item' }), 'Rappeler{Enter}')
      expect(addChecklistItem).toHaveBeenCalledWith(B, 'Rappeler')
    })
  })

  it('sans storageKey et avec une seule checklist, pas de sélecteur', () => {
    render(<AddChecklistItem checklists={[lists[0]]} label="Ajouter un article" />)
    expect(screen.queryByRole('combobox')).toBeNull()
  })
})
