// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderToString } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { disconnectGoogle, syncGoogleNow } from '@/app/actions/google'
import { GoogleForms } from './GoogleForms'

vi.mock('@/app/actions/google', () => ({ disconnectGoogle: vi.fn(), syncGoogleNow: vi.fn() }))

// Sans JS, le POST natif renvoie la page avec l'état de l'action déjà rempli (`formState`), sans que `onSubmit` ait tourné.
// `renderToString` n'a pas de `formState` : ce mock donne l'état initial voulu à l'action concernée, le reste est le vrai hook.
const postback = vi.hoisted(() => ({ action: null as unknown, state: null as unknown }))
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()
  return {
    ...actual,
    useActionState: (action: never, initial: never, ...rest: never[]) =>
      (actual.useActionState as (...args: unknown[]) => unknown)(action, action === postback.action ? postback.state : initial, ...rest),
  }
})

const ACCOUNT = { needsReauth: false }

beforeEach(() => {
  postback.action = null
  postback.state = null
  vi.mocked(disconnectGoogle).mockReset()
  vi.mocked(syncGoogleNow).mockReset()
})

describe('GoogleForms', () => {
  it('sans compte : lien « Connecter Google » et aucun bouton de synchro ni de déconnexion', () => {
    render(<GoogleForms account={null} />)
    expect(screen.getByRole('link', { name: 'Connecter Google' })).toHaveAttribute('href', '/api/google/connect')
    expect(screen.queryByRole('button', { name: 'Synchroniser maintenant' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Déconnecter' })).not.toBeInTheDocument()
  })

  it('avec un compte : « Reconnecter Google » et les deux boutons', () => {
    render(<GoogleForms account={ACCOUNT} />)
    expect(screen.getByRole('link', { name: 'Reconnecter Google' })).toHaveAttribute('href', '/api/google/connect')
    expect(screen.getByRole('button', { name: 'Synchroniser maintenant' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Déconnecter' })).toBeInTheDocument()
  })

  it('avec une reconnexion nécessaire : pas de bouton de synchro, « Déconnecter » reste', () => {
    render(<GoogleForms account={{ needsReauth: true }} />)
    expect(screen.queryByRole('button', { name: 'Synchroniser maintenant' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Déconnecter' })).toBeInTheDocument()
  })

  it('le code de la requête s’affiche : statut, alerte, ou message d’erreur pour un code inconnu', () => {
    const { rerender } = render(<GoogleForms account={ACCOUNT} code="connected" />)
    expect(screen.getByRole('status')).toHaveTextContent('Google connecté. Première synchro lancée.')
    rerender(<GoogleForms account={ACCOUNT} code="denied" />)
    expect(screen.getByRole('alert')).toHaveTextContent('Autorisation refusée chez Google.')
    rerender(<GoogleForms account={ACCOUNT} code="whatever" />)
    expect(screen.getByRole('alert')).toHaveTextContent('Connexion à Google impossible, réessaie.')
  })

  it('« Déconnecter » appelle l’action avec (null, FormData) et son message remplace celui de la requête', async () => {
    vi.mocked(disconnectGoogle).mockResolvedValue({ code: 'disconnected', at: 1 })
    render(<GoogleForms account={ACCOUNT} code="connected" />)
    expect(screen.getByRole('status')).toHaveTextContent('Google connecté.')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Déconnecter' }))
    expect(await screen.findByText(/Google déconnecté/)).toBeInTheDocument()
    expect(screen.queryByText(/Google connecté\./)).not.toBeInTheDocument()
    expect(screen.getAllByRole('status')).toHaveLength(1)
    const [prev, formData] = vi.mocked(disconnectGoogle).mock.calls[0]
    expect(prev).toBeNull()
    expect(formData).toBeInstanceOf(FormData)
  })

  it('une synchro en échec affiche l’alerte', async () => {
    vi.mocked(syncGoogleNow).mockResolvedValue({ code: 'sync-error', at: 1 })
    render(<GoogleForms account={ACCOUNT} />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Synchroniser maintenant' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('La synchro a échoué. Détails dans le journal des synchros.')
  })

  it('une déconnexion en échec affiche l’alerte propre à la déconnexion', async () => {
    vi.mocked(disconnectGoogle).mockResolvedValue({ code: 'disconnect-error', at: 1 })
    render(<GoogleForms account={ACCOUNT} />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Déconnecter' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('La déconnexion a échoué, réessaie.')
  })

  it('après une déconnexion, le rendu sans compte (revalidation) retire les formulaires et garde le message', async () => {
    vi.mocked(disconnectGoogle).mockResolvedValue({ code: 'disconnected', at: 1 })
    const { rerender } = render(<GoogleForms account={ACCOUNT} />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Déconnecter' }))
    await screen.findByText(/Google déconnecté/)
    rerender(<GoogleForms account={null} />)
    expect(screen.queryByRole('button', { name: 'Déconnecter' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Synchroniser maintenant' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Connecter Google' })).toBeInTheDocument()
    expect(screen.getByText(/Google déconnecté/)).toBeInTheDocument()
  })

  it('synchro puis déconnexion : seul le message du dernier formulaire envoyé reste', async () => {
    vi.mocked(syncGoogleNow).mockResolvedValue({ code: 'synced', at: 1 })
    vi.mocked(disconnectGoogle).mockResolvedValue({ code: 'disconnected', at: 2 })
    const user = userEvent.setup()
    render(<GoogleForms account={ACCOUNT} />)
    await user.click(screen.getByRole('button', { name: 'Synchroniser maintenant' }))
    expect(await screen.findByText('Synchro terminée.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Déconnecter' }))
    expect(await screen.findByText(/Google déconnecté/)).toBeInTheDocument()
    expect(screen.queryByText('Synchro terminée.')).not.toBeInTheDocument()
    expect(screen.getAllByRole('status')).toHaveLength(1)
  })

  it('sans JavaScript : l’état d’une déconnexion revenu du POST natif est rendu sans envoi', () => {
    postback.action = disconnectGoogle
    postback.state = { code: 'disconnected', at: 1 }
    expect(renderToString(<GoogleForms account={null} />)).toContain('Google déconnecté')
  })

  it('sans JavaScript : l’état d’une synchro revenu du POST natif est rendu sans envoi', () => {
    postback.action = syncGoogleNow
    postback.state = { code: 'synced', at: 1 }
    expect(renderToString(<GoogleForms account={ACCOUNT} />)).toContain('Synchro terminée.')
  })
})
