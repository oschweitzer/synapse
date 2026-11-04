// @vitest-environment jsdom
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { markMailRead } from '@/app/actions/google'
import type { MailHeader } from '@/lib/connectors/google'
import { MailList } from './MailList'

vi.mock('@/app/actions/google', () => ({ markMailRead: vi.fn() }))

const mail = (id: string, over: Partial<MailHeader> = {}): MailHeader => ({
  id,
  sender: `Expéditeur ${id}`,
  subject: `Sujet ${id}`,
  snippet: null,
  receivedAt: '2026-01-15T08:00:00Z',
  isUnread: true,
  href: `https://mail.google.com/#${id}`,
  ...over,
})

const MAILS = [mail('m1'), mail('m2', { isUnread: false })]

beforeEach(() => {
  vi.mocked(markMailRead).mockReset()
})

describe('MailList', () => {
  it('seuls les mails non lus ont un bouton « Marquer comme lu »', () => {
    render(<MailList mails={MAILS} canMarkRead />)
    expect(screen.getAllByRole('button')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Marquer comme lu : Sujet m1' })).toBeInTheDocument()
    expect(screen.getByText('1 non lu')).toBeInTheDocument()
  })

  it('cliquer marque lu tout de suite (bouton retiré, compteur baissé) et appelle markMailRead', async () => {
    vi.mocked(markMailRead).mockResolvedValue({})
    render(<MailList mails={MAILS} canMarkRead />)
    await userEvent.setup().click(screen.getByRole('button', { name: /Marquer comme lu/ }))
    expect(markMailRead).toHaveBeenCalledWith('m1')
    // Le bouton reste le temps de l'enregistrement (spinner), puis disparaît.
    await waitFor(() => expect(screen.queryByRole('button')).not.toBeInTheDocument())
    expect(screen.queryByText(/non lu/)).not.toBeInTheDocument()
  })

  it('au clavier : Tab jusqu’au bouton puis Entrée déclenche l’action', async () => {
    vi.mocked(markMailRead).mockResolvedValue({})
    const user = userEvent.setup()
    render(<MailList mails={MAILS} canMarkRead />)
    await user.tab() // le lien du mail
    await user.tab() // le bouton
    expect(screen.getByRole('button', { name: /Marquer comme lu/ })).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(markMailRead).toHaveBeenCalledWith('m1')
  })

  it('le bouton est frère du lien, jamais dedans', () => {
    render(<MailList mails={MAILS} canMarkRead />)
    const button = screen.getByRole('button', { name: /Marquer comme lu/ })
    expect(button.closest('a')).toBeNull()
  })

  it('échec : le mail redevient non lu et l’erreur s’affiche en role="alert"', async () => {
    vi.mocked(markMailRead).mockResolvedValue({ error: 'Gmail n’a pas pu marquer ce mail comme lu, réessaie.' })
    render(<MailList mails={MAILS} canMarkRead />)
    await userEvent.setup().click(screen.getByRole('button', { name: /Marquer comme lu/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Gmail n’a pas pu marquer')
    expect(screen.getByRole('button', { name: /Marquer comme lu/ })).toBeInTheDocument()
    expect(screen.getByText('1 non lu')).toBeInTheDocument()
    expect(within(screen.getByRole('alert')).queryByRole('link')).not.toBeInTheDocument()
  })

  it('échec avec reconnect : l’alerte contient le lien « Reconnecter Google »', async () => {
    vi.mocked(markMailRead).mockResolvedValue({ error: 'Reconnecte Google.', reconnect: true })
    render(<MailList mails={MAILS} canMarkRead />)
    await userEvent.setup().click(screen.getByRole('button', { name: /Marquer comme lu/ }))
    const link = within(await screen.findByRole('alert')).getByRole('link', { name: 'Reconnecter Google' })
    expect(link).toHaveAttribute('href', '/api/google/connect')
  })

  it('canMarkRead faux : aucun bouton, l’indication de reconnexion est affichée', () => {
    render(<MailList mails={MAILS} canMarkRead={false} />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getByText(/Reconnecte Google pour marquer tes mails comme lus/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Reconnecter Google' })).toHaveAttribute('href', '/api/google/connect')
  })

  it('canMarkRead faux mais aucun mail non lu : pas d’indication', () => {
    render(<MailList mails={[mail('m2', { isUnread: false })]} canMarkRead={false} />)
    expect(screen.queryByText(/Reconnecte Google/)).not.toBeInTheDocument()
  })

  it('deux clics rapprochés : chaque ligne garde son propre état d’enregistrement', async () => {
    vi.mocked(markMailRead).mockReturnValue(new Promise(() => {}))
    render(<MailList mails={[mail('m1'), mail('m3')]} canMarkRead />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Marquer comme lu : Sujet m1' }))
    await user.click(screen.getByRole('button', { name: 'Marquer comme lu : Sujet m3' }))
    expect(screen.getByRole('button', { name: 'Marquer comme lu : Sujet m1' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Marquer comme lu : Sujet m3' })).toBeDisabled()
  })

  it('les props rechargées font foi : un mail encore non lu côté serveur redevient non lu', async () => {
    vi.mocked(markMailRead).mockResolvedValue({})
    const { rerender } = render(<MailList mails={MAILS} canMarkRead />)
    await userEvent.setup().click(screen.getByRole('button', { name: /Marquer comme lu/ }))
    await waitFor(() => expect(screen.queryByText(/non lu/)).not.toBeInTheDocument())
    // Cache non mis à jour côté serveur : les nouvelles props disent toujours « non lu ».
    rerender(<MailList mails={[...MAILS]} canMarkRead />)
    expect(screen.getByText('1 non lu')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Marquer comme lu/ })).toBeInTheDocument()
  })

  it('de nouvelles props pendant un enregistrement ne rouvrent pas le mail en cours', async () => {
    vi.mocked(markMailRead).mockReturnValue(new Promise(() => {}))
    const { rerender } = render(<MailList mails={MAILS} canMarkRead />)
    await userEvent.setup().click(screen.getByRole('button', { name: /Marquer comme lu/ }))
    rerender(<MailList mails={[...MAILS]} canMarkRead />)
    expect(screen.queryByText(/non lu/)).not.toBeInTheDocument()
  })
})
