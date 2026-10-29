// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderToString } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createDashboard, deleteDashboard, resetDashboardOrder, saveDashboard, setDefaultDashboard } from '@/app/actions/dashboards'
import { DASHBOARDS_MAX } from '@/lib/dashboard'
import type { DashboardRow } from '@/lib/dashboards'
import { DashboardForms } from './DashboardForms'

vi.mock('@/app/actions/dashboards', () => ({
  createDashboard: vi.fn(),
  saveDashboard: vi.fn(),
  resetDashboardOrder: vi.fn(),
  setDefaultDashboard: vi.fn(),
  deleteDashboard: vi.fn(),
}))

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

const DASHBOARDS: DashboardRow[] = [
  { id: 'd1', name: 'Perso', visibility: 'private', isDefault: true, widgets: ['todo'] },
  { id: 'd2', name: 'Salon', visibility: 'public', isDefault: false, widgets: ['weather'] },
]

const actions = [createDashboard, saveDashboard, resetDashboardOrder, setDefaultDashboard, deleteDashboard]

beforeEach(() => {
  postback.action = null
  postback.state = null
  for (const action of actions) vi.mocked(action).mockReset()
})

const createInput = () => screen.getByLabelText('Nouveau dashboard')
const salonButton = (name: RegExp | string) => {
  const form = screen.getByDisplayValue('Salon').closest('form') as HTMLFormElement
  return Array.from(form.querySelectorAll('button')).find((b) =>
    typeof name === 'string' ? b.textContent === name : name.test(b.textContent ?? ''),
  ) as HTMLButtonElement
}

describe('DashboardForms', () => {
  it('rend un formulaire par dashboard avec ses boutons, et « par défaut » sur le dashboard par défaut', () => {
    render(<DashboardForms dashboards={DASHBOARDS} />)
    expect(screen.getAllByRole('button', { name: 'Enregistrer' })).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: 'Rétablir l’ordre par défaut' })).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: 'Définir par défaut' })).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: /^Supprimer/ })).toHaveLength(1)
    expect(screen.getAllByText('Dashboard par défaut')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Créer' })).toBeInTheDocument()
  })

  it('affiche l’alerte de lecture et pas de formulaire de création quand dashboards est null', () => {
    render(<DashboardForms dashboards={null} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Lecture des dashboards impossible.')
    expect(screen.queryByLabelText('Nouveau dashboard')).not.toBeInTheDocument()
  })

  it('masque le formulaire de création au maximum de dashboards', () => {
    const full = Array.from({ length: DASHBOARDS_MAX }, (_, i) => ({ ...DASHBOARDS[1], id: `x${i}`, name: `D${i}` }))
    render(<DashboardForms dashboards={full} />)
    expect(screen.queryByLabelText('Nouveau dashboard')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Créer' })).not.toBeInTheDocument()
  })

  it('garde le nom et la visibilité saisis et affiche l’erreur quand la création échoue', async () => {
    vi.mocked(createDashboard).mockResolvedValue({ code: 'max', at: 1, name: 'Cuisine', visibility: 'public' })
    render(<DashboardForms dashboards={DASHBOARDS} />)
    const user = userEvent.setup()
    await user.selectOptions(screen.getAllByLabelText('Visibilité').at(-1)!, 'public')
    await user.type(createInput(), 'Cuisine{Enter}')
    expect(await screen.findByRole('alert')).toHaveTextContent(`${DASHBOARDS_MAX} dashboards au plus`)
    expect(createInput()).toHaveValue('Cuisine')
    expect(screen.getAllByLabelText('Visibilité').at(-1)).toHaveValue('public')
  })

  it('vide le champ et confirme quand la création réussit', async () => {
    vi.mocked(createDashboard).mockResolvedValue({ code: 'created', at: 2 })
    render(<DashboardForms dashboards={DASHBOARDS} />)
    await userEvent.setup().type(createInput(), 'Cuisine{Enter}')
    expect(await screen.findByRole('status')).toHaveTextContent('Dashboard créé. Choisis ses widgets ci-dessous.')
    expect(createInput()).toHaveValue('')
  })

  it('appelle deleteDashboard (et pas saveDashboard) avec (null, FormData) au clic sur Supprimer', async () => {
    vi.mocked(deleteDashboard).mockResolvedValue({ code: 'deleted', at: 1 })
    render(<DashboardForms dashboards={DASHBOARDS} />)
    await userEvent.setup().click(screen.getByRole('button', { name: /^Supprimer/ }))
    expect(await screen.findByText('Dashboard supprimé.')).toBeInTheDocument()
    const [prev, formData] = vi.mocked(deleteDashboard).mock.calls[0]
    expect(prev).toBeNull()
    expect(formData).toBeInstanceOf(FormData)
    expect(formData.get('id')).toBe('d2')
    expect(saveDashboard).not.toHaveBeenCalled()
  })

  it('n’affiche que le dernier message, même avec des horodatages égaux', async () => {
    vi.mocked(saveDashboard).mockResolvedValue({ code: 'saved', at: 5 })
    vi.mocked(setDefaultDashboard).mockResolvedValue({ code: 'default', at: 5 })
    const user = userEvent.setup()
    render(<DashboardForms dashboards={DASHBOARDS} />)
    await user.click(salonButton('Enregistrer'))
    expect(await screen.findByText('Dashboard enregistré.')).toBeInTheDocument()
    await user.click(salonButton('Définir par défaut'))
    expect(await screen.findByText('Dashboard par défaut modifié.')).toBeInTheDocument()
    expect(screen.queryByText('Dashboard enregistré.')).not.toBeInTheDocument()
    expect(screen.getAllByRole('status')).toHaveLength(1)
  })

  it('sans bouton émetteur (submitter absent), ne présume pas « save » : retombe sur le premier état rempli', async () => {
    vi.mocked(createDashboard).mockResolvedValue({ code: 'max', at: 1, name: 'Cuisine', visibility: 'private' })
    vi.mocked(saveDashboard).mockResolvedValue({ code: 'saved', at: 2 })
    const user = userEvent.setup()
    render(<DashboardForms dashboards={DASHBOARDS} />)
    await user.type(createInput(), 'Cuisine{Enter}')
    expect(await screen.findByRole('alert')).toHaveTextContent(`${DASHBOARDS_MAX} dashboards au plus`)
    // `fireEvent.submit` envoie un événement sans `submitter`, comme un navigateur qui ne l'indique pas.
    fireEvent.submit(screen.getByDisplayValue('Salon').closest('form') as HTMLFormElement)
    await vi.waitFor(() => expect(saveDashboard).toHaveBeenCalled())
    expect(screen.queryByText('Dashboard enregistré.')).not.toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent(`${DASHBOARDS_MAX} dashboards au plus`)
  })

  it('un code inconnu retombe sur le message d’enregistrement impossible', async () => {
    vi.mocked(saveDashboard).mockResolvedValue({ code: 'whatever', at: 1 })
    render(<DashboardForms dashboards={DASHBOARDS} />)
    await userEvent.setup().click(salonButton('Enregistrer'))
    expect(await screen.findByRole('alert')).toHaveTextContent('Enregistrement impossible, réessaie.')
  })

  it('rend les actions serveur comme action du formulaire et formaction des boutons : les formulaires marchent sans JavaScript', () => {
    // Une action serveur porte `$$FORM_ACTION` : au rendu serveur React en tire l'URL. Une fonction enveloppante la
    // perdrait (`javascript:throw new Error(…)`). Comme une vraie action serveur, le mock la garde une fois liée (`bind`).
    const urls = new Map<unknown, string>([
      [saveDashboard, '/save-sans-js'],
      [resetDashboardOrder, '/reset-sans-js'],
      [setDefaultDashboard, '/default-sans-js'],
      [deleteDashboard, '/delete-sans-js'],
    ])
    for (const [action, url] of urls) {
      const fields = { action: url, method: 'POST', encType: 'multipart/form-data', target: undefined, data: null }
      const bound = Object.assign(() => {}, { $$FORM_ACTION: () => ({ ...fields }) })
      const serverAction = action as { $$FORM_ACTION?: unknown; bind?: unknown }
      serverAction.$$FORM_ACTION = () => ({ ...fields })
      serverAction.bind = () => bound
    }
    try {
      const html = renderToString(<DashboardForms dashboards={DASHBOARDS} />)
      expect(html.match(/<form [^>]*action="\/save-sans-js"/g)).toHaveLength(2)
      expect(html.match(/<button [^>]*formAction="\/reset-sans-js"/g)).toHaveLength(2)
      expect(html.match(/<button [^>]*formAction="\/default-sans-js"/g)).toHaveLength(1)
      expect(html.match(/<button [^>]*formAction="\/delete-sans-js"/g)).toHaveLength(1)
    } finally {
      for (const action of urls.keys()) {
        const serverAction = action as { $$FORM_ACTION?: unknown; bind?: unknown }
        delete serverAction.$$FORM_ACTION
        delete serverAction.bind
      }
    }
  })

  it('affiche le retour d’une suppression revenu d’un envoi sans JavaScript, où aucun onSubmit n’a tourné', () => {
    postback.action = deleteDashboard
    postback.state = { code: 'deleted', at: 1 }
    expect(renderToString(<DashboardForms dashboards={DASHBOARDS} />)).toContain('Dashboard supprimé.')
  })
})
