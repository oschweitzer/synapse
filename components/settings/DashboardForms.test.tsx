// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderToString } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createDashboard, deleteDashboard, resetDashboardOrder, saveDashboard, setDefaultDashboard } from '@/app/actions/dashboards'
import { DASHBOARDS_MAX, WIDGETS, WIDGET_IDS, type WidgetId } from '@/lib/dashboard'
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

const ORDERED: DashboardRow[] = [{ id: 'd1', name: 'Perso', visibility: 'private', isDefault: true, widgets: ['weather', 'todo'] }]
const widget = (id: WidgetId) => WIDGETS.find((w) => w.id === id)!
const values = () => screen.getAllByRole('checkbox').map((c) => (c as HTMLInputElement).value)

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

  it('liste les widgets cochés dans l’ordre enregistré puis les autres dans l’ordre du catalogue', () => {
    render(<DashboardForms dashboards={ORDERED} />)
    const boxes = screen.getAllByRole('checkbox') as HTMLInputElement[]
    expect(boxes.slice(0, 2).map((c) => c.value)).toEqual(['weather', 'todo'])
    expect(boxes.filter((c) => c.checked).map((c) => c.value)).toEqual(['weather', 'todo'])
    expect(boxes.slice(2).map((c) => c.value)).toEqual(WIDGET_IDS.filter((id) => id !== 'weather' && id !== 'todo'))
  })

  it('désactive « Monter » sur le premier widget et « Descendre » sur le dernier', () => {
    render(<DashboardForms dashboards={ORDERED} />)
    expect(screen.getByRole('button', { name: 'Monter « Météo »' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Descendre « Météo »' })).toBeEnabled()
    const last = widget(WIDGET_IDS.filter((id) => id !== 'weather' && id !== 'todo').at(-1)!)
    expect(screen.getByRole('button', { name: `Descendre « ${last.label} »` })).toBeDisabled()
  })

  it('monte « À faire » avant Météo, garde les cases cochées et envoie le nouvel ordre', async () => {
    vi.mocked(saveDashboard).mockResolvedValue({ code: 'saved', at: 1 })
    const user = userEvent.setup()
    render(<DashboardForms dashboards={ORDERED} />)
    await user.click(screen.getByRole('button', { name: 'Monter « À faire »' }))
    expect(values().slice(0, 2)).toEqual(['todo', 'weather'])
    expect((screen.getAllByRole('checkbox') as HTMLInputElement[]).filter((c) => c.checked)).toHaveLength(2)
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await vi.waitFor(() => expect(saveDashboard).toHaveBeenCalled())
    expect(vi.mocked(saveDashboard).mock.calls[0][1].getAll('widgets')).toEqual(['todo', 'weather'])
  })

  it('envoie à sa place un widget non coché déplacé puis coché', async () => {
    vi.mocked(saveDashboard).mockResolvedValue({ code: 'saved', at: 1 })
    const user = userEvent.setup()
    render(<DashboardForms dashboards={ORDERED} />)
    const mail = widget('mail').label
    const position = values().indexOf('mail')
    for (let i = 0; i < position; i++) await user.click(screen.getByRole('button', { name: `Monter « ${mail} »` }))
    expect(values()[0]).toBe('mail')
    await user.click(screen.getAllByRole('checkbox')[0])
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await vi.waitFor(() => expect(saveDashboard).toHaveBeenCalled())
    expect(vi.mocked(saveDashboard).mock.calls[0][1].getAll('widgets')).toEqual(['mail', 'weather', 'todo'])
  })

  it('garde le focus sur le widget déplacé et annonce sa position', async () => {
    const user = userEvent.setup()
    render(<DashboardForms dashboards={ORDERED} />)
    await user.click(screen.getByRole('button', { name: 'Descendre « Météo »' }))
    expect(screen.getByRole('button', { name: 'Descendre « Météo »' })).toHaveFocus()
    // Météo et À faire sont cochés : la position est comptée parmi les 2 widgets cochés.
    expect(screen.getByText('« Météo » déplacé en position 2 sur 2.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Monter « Météo »' }))
    // Arrivé en tête, « Monter » est désactivé : le focus passe sur « Descendre ».
    expect(screen.getByRole('button', { name: 'Descendre « Météo »' })).toHaveFocus()
  })

  it('garde les modifications non enregistrées quand le serveur envoie un autre ordre', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<DashboardForms dashboards={ORDERED} />)
    await user.click(screen.getByRole('button', { name: 'Descendre « Météo »' }))
    const moved = values()
    rerender(<DashboardForms dashboards={[{ ...ORDERED[0], widgets: ['todo', 'weather'] }]} />)
    expect(values()).toEqual(moved)
  })

  it('remonte la liste de son dashboard après un enregistrement réussi', async () => {
    // Le résultat de l'action et les nouvelles données arrivent ensemble : on envoie les données avant de rendre la main.
    let finish: (value: { code: string; at: number }) => void = () => {}
    vi.mocked(saveDashboard).mockReturnValue(new Promise((resolve) => (finish = resolve)))
    const user = userEvent.setup()
    const { rerender } = render(<DashboardForms dashboards={ORDERED} />)
    await user.click(screen.getByRole('button', { name: 'Descendre « Météo »' }))
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await vi.waitFor(() => expect(saveDashboard).toHaveBeenCalled())
    rerender(<DashboardForms dashboards={[{ ...ORDERED[0], widgets: ['weather', 'mail', 'todo'] }]} />)
    expect(values().slice(0, 2)).toEqual(['todo', 'weather'])
    finish({ code: 'saved', at: 1 })
    await vi.waitFor(() => expect(values().slice(0, 3)).toEqual(['weather', 'mail', 'todo']))
  })

  it('poste l’ordre affiché au montage, même si le serveur en envoie un autre ensuite', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<DashboardForms dashboards={ORDERED} />)
    const initial = () => (document.querySelector('input[name="initialWidgets"]') as HTMLInputElement).value
    expect(initial()).toBe('weather,todo')
    await user.click(screen.getByRole('button', { name: 'Descendre « Météo »' }))
    rerender(<DashboardForms dashboards={[{ ...ORDERED[0], widgets: ['todo', 'weather'] }]} />)
    expect(initial()).toBe('weather,todo')
  })

  it('ne remonte que la liste du dashboard rétabli, pas celles des autres', async () => {
    vi.mocked(resetDashboardOrder).mockResolvedValue({ code: 'order-reset', at: 1 })
    const user = userEvent.setup()
    render(<DashboardForms dashboards={DASHBOARDS} />)
    const salon = screen.getByDisplayValue('Salon').closest('form') as HTMLFormElement
    const perso = screen.getByDisplayValue('Perso').closest('form') as HTMLFormElement
    const order = (form: HTMLFormElement) => Array.from(form.querySelectorAll<HTMLInputElement>('input[name="widgets"]')).map((c) => c.value)
    const salonBefore = order(salon)
    await user.click(within(salon).getByRole('button', { name: 'Descendre « Météo »' }))
    const salonMoved = order(salon)
    expect(salonMoved).not.toEqual(salonBefore)
    const persoBefore = order(perso)
    await user.click(within(perso).getByRole('button', { name: 'Descendre « À faire »' }))
    expect(order(perso)).not.toEqual(persoBefore)
    await user.click(within(perso).getByRole('button', { name: 'Rétablir l’ordre par défaut' }))
    await vi.waitFor(() => expect(resetDashboardOrder).toHaveBeenCalled())
    await vi.waitFor(() => expect(order(perso)).toEqual(persoBefore))
    expect(order(salon)).toEqual(salonMoved)
  })

  it('précise que seule la place des widgets cochés est enregistrée', () => {
    render(<DashboardForms dashboards={ORDERED} />)
    expect(screen.getAllByText(/la place des widgets non cochés n’est pas enregistrée/).length).toBeGreaterThan(0)
  })

  it('annonce la position parmi tous les widgets pour un widget non coché', async () => {
    const user = userEvent.setup()
    render(<DashboardForms dashboards={ORDERED} />)
    const mail = widget('mail').label
    await user.click(screen.getByRole('button', { name: `Monter « ${mail} »` }))
    const position = values().indexOf('mail') + 1
    expect(screen.getByText(`« ${mail} » déplacé en position ${position} sur ${WIDGET_IDS.length}.`)).toBeInTheDocument()
  })
})
