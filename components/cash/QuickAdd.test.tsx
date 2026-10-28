// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { QuickAdd } from './QuickAdd'

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))

function reply(body: unknown, ok = true) {
  return { ok, redirected: false, json: async () => body }
}

async function fillAndSubmit() {
  const user = userEvent.setup()
  render(<QuickAdd idPrefix="q" categories={['Courses']} today="2026-03-04" />)
  await user.type(screen.getByLabelText('Montant en CHF'), '12,5')
  await user.click(screen.getByRole('button', { name: 'Ajouter' }))
}

describe('QuickAdd', () => {
  it('affiche le bouton « Ajouter » et la date du jour', () => {
    render(<QuickAdd idPrefix="q" categories={['Courses']} today="2026-03-04" />)
    expect(screen.getByRole('button', { name: 'Ajouter' })).toBeInTheDocument()
    expect(screen.getByLabelText('Date')).toHaveValue('2026-03-04')
  })

  it("succès: POST /api/cash avec le corps JSON, router.refresh appelé, statut 'Ajouté.'", async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply({}))
    vi.stubGlobal('fetch', fetchMock)
    await fillAndSubmit()
    expect(await screen.findByRole('status')).toHaveTextContent('Ajouté.')
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/cash',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ date: '2026-03-04', amount: 12.5, category: 'Courses', note: null }) }),
    )
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it("échec de l'API: message d'erreur affiché, router.refresh non appelé", async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply({ error: 'Feuille introuvable.' }, false)))
    await fillAndSubmit()
    expect(await screen.findByRole('alert')).toHaveTextContent('Feuille introuvable.')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Ajouter' })).toBeEnabled())
    expect(refresh).not.toHaveBeenCalled()
  })
})
