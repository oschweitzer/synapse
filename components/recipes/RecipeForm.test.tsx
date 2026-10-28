// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { saveRecipe } from '@/app/actions/recipes'
import { RecipeForm } from './RecipeForm'

// Le module réel est un 'use server' qui tire Supabase et next/cache : fabrique obligatoire.
vi.mock('@/app/actions/recipes', () => ({ saveRecipe: vi.fn() }))
vi.mock('next/link', () => ({
  default: function Link({ href, children, ...rest }: { href: unknown; children?: React.ReactNode }) {
    return (
      <a href={String(href)} {...rest}>
        {children}
      </a>
    )
  },
}))

const recipe = {
  id: 'r1',
  title: 'Gratin',
  ingredients: ['200 g de pâtes', '1 oignon'],
  steps: ['Cuire', 'Gratiner'],
  source_url: 'https://exemple.ch/gratin',
}

describe('RecipeForm', () => {
  it('nouvelle recette: champs vides, pas de champ id caché, Annuler pointe vers /recipes', () => {
    const { container } = render(<RecipeForm />)
    expect(screen.getByLabelText('Titre')).toHaveValue('')
    expect(container.querySelector('input[name="id"]')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Annuler' })).toHaveAttribute('href', '/recipes')
  })

  it('édition: champs pré-remplis, id caché, Annuler pointe vers /recipes/<id>', () => {
    const { container } = render(<RecipeForm recipe={recipe} />)
    expect(container.querySelector('input[name="id"]')).toHaveValue('r1')
    expect(screen.getByLabelText('Titre')).toHaveValue('Gratin')
    expect(container.querySelector('textarea[name="ingredients"]')).toHaveValue('200 g de pâtes\n1 oignon')
    expect(container.querySelector('textarea[name="steps"]')).toHaveValue('Cuire\nGratiner')
    expect(screen.getByLabelText(/Lien source/)).toHaveValue('https://exemple.ch/gratin')
    expect(screen.getByRole('link', { name: 'Annuler' })).toHaveAttribute('href', '/recipes/r1')
  })

  it("erreur connue ('url') affiche son message en role='alert'", () => {
    render(<RecipeForm error="url" />)
    expect(screen.getByRole('alert')).toHaveTextContent('Le lien doit commencer par http:// ou https://.')
  })

  it("erreur inconnue affiche le message 'Enregistrement impossible, réessaie.'", () => {
    render(<RecipeForm error="inconnue" />)
    expect(screen.getByRole('alert')).toHaveTextContent('Enregistrement impossible, réessaie.')
  })

  it('sans erreur, aucune alerte', () => {
    render(<RecipeForm />)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('envoi: appelle saveRecipe avec un FormData dont title vaut la saisie', async () => {
    const user = userEvent.setup()
    render(<RecipeForm />)
    await user.type(screen.getByLabelText('Titre'), 'Tarte')
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(saveRecipe).toHaveBeenCalledTimes(1))
    const formData = vi.mocked(saveRecipe).mock.calls[0][0]
    expect(formData.get('title')).toBe('Tarte')
  })
})
