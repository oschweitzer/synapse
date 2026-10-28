// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { EntryForm } from './EntryForm'

const categories = ['Courses', 'Loisirs']

/** Réponse minimale lue par `cashApi` : `ok`, `redirected` et `json()`. */
function reply(body: unknown, ok = true) {
  return { ok, redirected: false, json: async () => body }
}

function setup(props: Partial<React.ComponentProps<typeof EntryForm>> = {}) {
  const onSubmit = vi.fn<(entry: unknown) => Promise<string | null>>().mockResolvedValue(null)
  render(
    <EntryForm
      idPrefix="t"
      categories={categories}
      initial={{ date: '2026-03-04' }}
      submitLabel="Ajouter"
      onSubmit={onSubmit}
      {...props}
    />,
  )
  return { onSubmit, user: userEvent.setup() }
}

describe('EntryForm', () => {
  it('pré-remplit la date, le montant et la catégorie (première catégorie par défaut)', () => {
    setup({ initial: { date: '2026-03-04', amount: 12.5 } })
    expect(screen.getByLabelText('Date')).toHaveValue('2026-03-04')
    expect(screen.getByLabelText('Montant en CHF')).toHaveValue('12.5')
    expect(screen.getByLabelText('Catégorie')).toHaveValue('Courses')
  })

  it("envoi: onSubmit reçoit { date, amount: 12.5, category, note: null } pour '12,5' sans remarque", async () => {
    const { onSubmit, user } = setup()
    await user.type(screen.getByLabelText('Montant en CHF'), '12,5')
    await user.click(screen.getByRole('button', { name: 'Ajouter' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit).toHaveBeenCalledWith({ date: '2026-03-04', amount: 12.5, category: 'Courses', note: null })
  })

  it("ajout rapide (sans onCancel): après succès, montant et remarque vidés, date et catégorie gardées, statut 'Ajouté.'", async () => {
    const { user } = setup()
    await user.selectOptions(screen.getByLabelText('Catégorie'), 'Loisirs')
    await user.type(screen.getByLabelText('Montant en CHF'), '8')
    await user.type(screen.getByLabelText('Remarque'), 'Cinéma')
    await user.click(screen.getByRole('button', { name: 'Ajouter' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Ajouté.')
    expect(screen.getByLabelText('Montant en CHF')).toHaveValue('')
    expect(screen.getByLabelText('Remarque')).toHaveValue('')
    expect(screen.getByLabelText('Date')).toHaveValue('2026-03-04')
    expect(screen.getByLabelText('Catégorie')).toHaveValue('Loisirs')
  })

  it("édition (avec onCancel): Annuler appelle onCancel ; après succès pas de message 'Ajouté.'", async () => {
    const onCancel = vi.fn()
    const { onSubmit, user } = setup({ onCancel, initial: { date: '2026-03-04', amount: 5 } })
    await user.click(screen.getByRole('button', { name: 'Annuler' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
    await user.click(screen.getByRole('button', { name: 'Ajouter' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(screen.queryByText('Ajouté.')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Montant en CHF')).toHaveValue('5')
  })

  it('onSubmit renvoie une erreur: message en role="alert", champs conservés', async () => {
    const { onSubmit, user } = setup()
    onSubmit.mockResolvedValue('Montant refusé.')
    await user.type(screen.getByLabelText('Montant en CHF'), '9')
    await user.click(screen.getByRole('button', { name: 'Ajouter' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Montant refusé.')
    expect(screen.getByLabelText('Montant en CHF')).toHaveValue('9')
  })

  it('« Nouvelle catégorie… »: POST /api/cash/categories avec { name }, puis onSubmit reçoit la catégorie renvoyée', async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply({ name: 'Sport' }))
    vi.stubGlobal('fetch', fetchMock)
    const { onSubmit, user } = setup()
    await user.selectOptions(screen.getByLabelText('Catégorie'), 'Nouvelle catégorie…')
    await user.type(screen.getByLabelText('Nom de la nouvelle catégorie'), 'sport')
    await user.type(screen.getByLabelText('Montant en CHF'), '20')
    await user.click(screen.getByRole('button', { name: 'Ajouter' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(fetchMock).toHaveBeenCalledWith('/api/cash/categories', expect.objectContaining({ method: 'POST', body: JSON.stringify({ name: 'sport' }) }))
    expect(onSubmit).toHaveBeenCalledWith({ date: '2026-03-04', amount: 20, category: 'Sport', note: null })
  })

  it('création de catégorie refusée: message d’erreur affiché, onSubmit non appelé', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply({ error: 'Catégorie déjà existante.' }, false)))
    const { onSubmit, user } = setup()
    await user.selectOptions(screen.getByLabelText('Catégorie'), 'Nouvelle catégorie…')
    await user.type(screen.getByLabelText('Nom de la nouvelle catégorie'), 'Courses')
    await user.type(screen.getByLabelText('Montant en CHF'), '20')
    await user.click(screen.getByRole('button', { name: 'Ajouter' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Catégorie déjà existante.')
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it("fetch qui rejette: message 'Réseau indisponible, réessaie.'", async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')))
    const { onSubmit, user } = setup()
    await user.selectOptions(screen.getByLabelText('Catégorie'), 'Nouvelle catégorie…')
    await user.type(screen.getByLabelText('Nom de la nouvelle catégorie'), 'Sport')
    await user.type(screen.getByLabelText('Montant en CHF'), '20')
    await user.click(screen.getByRole('button', { name: 'Ajouter' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Réseau indisponible, réessaie.')
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
