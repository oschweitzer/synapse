// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderToString } from 'react-dom/server'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDashboard, deleteDashboard, resetDashboardOrder, saveDashboard, setDefaultDashboard } from '@/app/actions/dashboards'
import { DASHBOARDS_MAX, WIDGETS } from '@/lib/dashboard'
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
const values = () => Array.from(document.querySelectorAll<HTMLInputElement>('input[name="widgets"]'), (i) => i.value)

// jsdom n'implémente pas les méthodes du dialogue natif.
beforeAll(() => {
  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function () {
      this.setAttribute('open', '')
    }
  }
  if (!HTMLDialogElement.prototype.close) {
    HTMLDialogElement.prototype.close = function () {
      this.removeAttribute('open')
      this.dispatchEvent(new Event('close'))
    }
  }
})

const openPicker = () => screen.getByRole('button', { name: /^Ajouter un widget/ })

/** Ouvre le sélecteur, coche les widgets par libellé et confirme. */
async function addWidgets(user: ReturnType<typeof userEvent.setup>, labels: string[]) {
  await user.click(openPicker())
  for (const label of labels) await user.click(screen.getByRole('checkbox', { name: new RegExp(`^${label}`) }))
  await user.click(screen.getByRole('button', { name: `Ajouter (${labels.length})` }))
}

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

  it('ne liste que les widgets du dashboard, dans l’ordre enregistré', () => {
    render(<DashboardForms dashboards={ORDERED} />)
    expect(values()).toEqual(['weather', 'todo'])
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('liste seulement ses widgets : Perso montre « À faire » (champ caché) et ni « Mails » ni « Météo »', () => {
    render(<DashboardForms dashboards={DASHBOARDS} />)
    const perso = screen.getByDisplayValue('Perso').closest('form') as HTMLFormElement
    expect(Array.from(perso.querySelectorAll<HTMLInputElement>('input[name="widgets"]'), (i) => i.value)).toEqual(['todo'])
    expect(within(perso).getByText('À faire')).toBeInTheDocument()
    expect(within(perso).queryByText('Mails')).not.toBeInTheDocument()
    expect(within(perso).queryByText('Météo')).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('affiche le badge « sensible » sur un widget sensible listé', () => {
    render(<DashboardForms dashboards={[{ ...DASHBOARDS[0], widgets: ['mail'] }]} />)
    expect(screen.getByText('sensible')).toBeInTheDocument()
  })

  it('désactive « Monter » sur le premier widget et « Descendre » sur le dernier', () => {
    render(<DashboardForms dashboards={ORDERED} />)
    expect(screen.getByRole('button', { name: 'Monter « Météo »' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Descendre « Météo »' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Descendre « À faire »' })).toBeDisabled()
  })

  it('monte « À faire » avant Météo et envoie le nouvel ordre', async () => {
    vi.mocked(saveDashboard).mockResolvedValue({ code: 'saved', at: 1 })
    const user = userEvent.setup()
    render(<DashboardForms dashboards={ORDERED} />)
    await user.click(screen.getByRole('button', { name: 'Monter « À faire »' }))
    expect(values()).toEqual(['todo', 'weather'])
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await vi.waitFor(() => expect(saveDashboard).toHaveBeenCalled())
    expect(vi.mocked(saveDashboard).mock.calls[0][1].getAll('widgets')).toEqual(['todo', 'weather'])
  })

  it('ajoute Mails par le sélecteur, le monte en tête et l’envoie à sa place', async () => {
    vi.mocked(saveDashboard).mockResolvedValue({ code: 'saved', at: 1 })
    const user = userEvent.setup()
    render(<DashboardForms dashboards={ORDERED} />)
    await addWidgets(user, ['Mails'])
    expect(values()).toEqual(['weather', 'todo', 'mail'])
    await user.click(screen.getByRole('button', { name: 'Monter « Mails »' }))
    await user.click(screen.getByRole('button', { name: 'Monter « Mails »' }))
    expect(values()).toEqual(['mail', 'weather', 'todo'])
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await vi.waitFor(() => expect(saveDashboard).toHaveBeenCalled())
    expect(vi.mocked(saveDashboard).mock.calls[0][1].getAll('widgets')).toEqual(['mail', 'weather', 'todo'])
  })

  it('garde le focus sur le widget déplacé et annonce sa position', async () => {
    const user = userEvent.setup()
    render(<DashboardForms dashboards={ORDERED} />)
    await user.click(screen.getByRole('button', { name: 'Descendre « Météo »' }))
    // Arrivé en dernier, « Descendre » est désactivé : le focus passe sur « Monter ».
    expect(screen.getByRole('button', { name: 'Monter « Météo »' })).toHaveFocus()
    expect(screen.getByText('« Météo » déplacé en position 2 sur 2.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Monter « Météo »' }))
    // Arrivé en tête, « Monter » est désactivé : le focus passe sur « Descendre ».
    expect(screen.getByRole('button', { name: 'Descendre « Météo »' })).toHaveFocus()
  })

  it('ne redonne pas le focus à une flèche après un ajout : la demande de focus est consommée', async () => {
    const user = userEvent.setup()
    render(<DashboardForms dashboards={ORDERED} />)
    await user.click(screen.getByRole('button', { name: 'Descendre « Météo »' }))
    expect(screen.getByRole('button', { name: 'Monter « Météo »' })).toHaveFocus()
    await addWidgets(user, ['Mails'])
    expect(screen.getByRole('button', { name: /^Ajouter un widget/ })).toHaveFocus()
  })

  it('annonce la position parmi les widgets du dashboard', async () => {
    const user = userEvent.setup()
    render(<DashboardForms dashboards={[{ ...ORDERED[0], widgets: ['weather', 'todo', 'shopping'] }]} />)
    await user.click(screen.getByRole('button', { name: 'Descendre « Météo »' }))
    expect(screen.getByText('« Météo » déplacé en position 2 sur 3.')).toBeInTheDocument()
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
    expect(values()).toEqual(['todo', 'weather'])
    finish({ code: 'saved', at: 1 })
    await vi.waitFor(() => expect(values()).toEqual(['weather', 'mail', 'todo']))
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
    render(
      <DashboardForms
        dashboards={[
          { id: 'd1', name: 'Perso', visibility: 'private', isDefault: true, widgets: ['todo', 'shopping'] },
          { id: 'd2', name: 'Salon', visibility: 'public', isDefault: false, widgets: ['weather', 'agenda'] },
        ]}
      />,
    )
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

  it('retire « À faire » : la ligne disparaît, le focus va sur « Ajouter un widget » et l’enregistrement envoie une liste vide', async () => {
    vi.mocked(saveDashboard).mockResolvedValue({ code: 'saved', at: 1 })
    const user = userEvent.setup()
    render(<DashboardForms dashboards={[DASHBOARDS[0]]} />)
    await user.click(screen.getByRole('button', { name: /^Retirer « À faire »/ }))
    expect(values()).toEqual([])
    expect(screen.getByText('Aucun widget.')).toBeInTheDocument()
    expect(screen.getByText('« À faire » retiré.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Ajouter un widget/ })).toHaveFocus()
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await vi.waitFor(() => expect(saveDashboard).toHaveBeenCalled())
    expect(vi.mocked(saveDashboard).mock.calls[0][1].getAll('widgets')).toEqual([])
  })

  describe('sélecteur de widgets', () => {
    const persoOnly = [DASHBOARDS[0]]

    it('ouvre un dialogue qui ne liste que les widgets restants, groupés par source', async () => {
      const user = userEvent.setup()
      render(<DashboardForms dashboards={persoOnly} />)
      await user.click(openPicker())
      const dialog = screen.getByRole('dialog', { name: /^Ajouter des widgets à « Perso »/ })
      expect(within(dialog).queryByRole('checkbox', { name: /^À faire/ })).not.toBeInTheDocument()
      expect(within(dialog).getAllByRole('checkbox')).toHaveLength(WIDGETS.length - 1)
      expect(within(dialog).getByRole('group', { name: 'Garmin' })).toBeInTheDocument()
      expect(within(dialog).getByRole('checkbox', { name: /^Mails/ })).toBeInTheDocument()
    })

    it('coche Météo puis Courses, ajoute en fin de liste dans l’ordre du catalogue et envoie le tout', async () => {
      vi.mocked(saveDashboard).mockResolvedValue({ code: 'saved', at: 1 })
      const user = userEvent.setup()
      render(<DashboardForms dashboards={persoOnly} />)
      await user.click(openPicker())
      await user.click(screen.getByRole('checkbox', { name: /^Météo/ }))
      await user.click(screen.getByRole('checkbox', { name: /^Courses/ }))
      await user.click(screen.getByRole('button', { name: 'Ajouter (2)' }))
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(values()).toEqual(['todo', 'shopping', 'weather'])
      expect(screen.getByText('2 widgets ajoutés en fin de liste.')).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
      await vi.waitFor(() => expect(saveDashboard).toHaveBeenCalled())
      expect(vi.mocked(saveDashboard).mock.calls[0][1].getAll('widgets')).toEqual(['todo', 'shopping', 'weather'])
    })

    it('place les ajouts après l’ordre modifié non enregistré', async () => {
      vi.mocked(saveDashboard).mockResolvedValue({ code: 'saved', at: 1 })
      const user = userEvent.setup()
      render(<DashboardForms dashboards={ORDERED} />)
      await user.click(screen.getByRole('button', { name: 'Monter « À faire »' }))
      await addWidgets(user, ['Courses'])
      await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
      await vi.waitFor(() => expect(saveDashboard).toHaveBeenCalled())
      expect(vi.mocked(saveDashboard).mock.calls[0][1].getAll('widgets')).toEqual(['todo', 'weather', 'shopping'])
    })

    it('garde « Ajouter (0) » désactivé tant que rien n’est coché', async () => {
      const user = userEvent.setup()
      render(<DashboardForms dashboards={persoOnly} />)
      await user.click(openPicker())
      expect(screen.getByRole('button', { name: 'Ajouter (0)' })).toBeDisabled()
    })

    it('« Annuler » ferme sans ajouter ; à la réouverture rien n’est coché et la recherche est vide', async () => {
      const user = userEvent.setup()
      render(<DashboardForms dashboards={persoOnly} />)
      await user.click(openPicker())
      await user.type(screen.getByRole('searchbox', { name: 'Rechercher un widget' }), 'garmin')
      await user.click(screen.getByRole('checkbox', { name: /^Activités/ }))
      await user.click(screen.getByRole('button', { name: 'Annuler' }))
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(values()).toEqual(['todo'])
      await user.click(openPicker())
      expect(screen.getByRole('searchbox', { name: 'Rechercher un widget' })).toHaveValue('')
      expect((screen.getAllByRole('checkbox') as HTMLInputElement[]).some((c) => c.checked)).toBe(false)
    })

    it('un appui commencé dans le contenu et relâché sur le dialogue ne ferme pas le sélecteur', async () => {
      const user = userEvent.setup()
      render(<DashboardForms dashboards={persoOnly} />)
      await user.click(openPicker())
      const dialog = document.querySelector('dialog')!
      fireEvent.mouseDown(screen.getByRole('searchbox', { name: 'Rechercher un widget' }))
      fireEvent.click(dialog)
      expect(screen.getByRole('dialog', { name: /^Ajouter des widgets/ })).toBeInTheDocument()
      fireEvent.mouseDown(dialog)
      fireEvent.click(dialog)
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('Échap (événement cancel) ferme sans ajouter et remet le focus sur le déclencheur', async () => {
      const user = userEvent.setup()
      render(<DashboardForms dashboards={persoOnly} />)
      await user.click(openPicker())
      await user.click(screen.getByRole('checkbox', { name: /^Météo/ }))
      fireEvent(document.querySelector('dialog')!, new Event('cancel', { cancelable: true }))
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(values()).toEqual(['todo'])
      expect(openPicker()).toHaveFocus()
    })

    it('filtre par recherche sans tenir compte de la casse ni des accents ; Entrée n’envoie pas le formulaire', async () => {
      const user = userEvent.setup()
      render(<DashboardForms dashboards={persoOnly} />)
      await user.click(openPicker())
      const search = screen.getByRole('searchbox', { name: 'Rechercher un widget' })
      await user.type(search, 'garmin')
      expect(screen.getAllByRole('checkbox').map((c) => c.closest('label')!.textContent)).toEqual([
        expect.stringContaining('Activités'),
        expect.stringContaining('7 derniers jours'),
        expect.stringContaining('Sommeil'),
      ])
      await user.clear(search)
      await user.type(search, 'meteo')
      expect(screen.getAllByRole('checkbox')).toHaveLength(1)
      expect(screen.getByRole('checkbox', { name: /^Météo/ })).toBeInTheDocument()
      await user.clear(search)
      await user.type(search, 'zzz{Enter}')
      expect(screen.getByText('Aucun widget ne correspond.')).toBeInTheDocument()
      expect(saveDashboard).not.toHaveBeenCalled()
    })

    it('sur le dashboard public Salon, la case « Mails » est désactivée et l’explication affichée', async () => {
      const user = userEvent.setup()
      render(<DashboardForms dashboards={[DASHBOARDS[1]]} />)
      await user.click(openPicker())
      const mail = screen.getByRole('checkbox', { name: /^Mails/ })
      expect(mail).toBeDisabled()
      expect(mail).toHaveAccessibleDescription(expect.stringContaining('Un dashboard public ne peut pas afficher de widget sensible.'))
      expect(screen.getByRole('checkbox', { name: /^Agenda/ })).toBeEnabled()
    })

    it('passer Perso en public désactive les widgets sensibles et avertit si l’un est déjà listé', async () => {
      const user = userEvent.setup()
      render(<DashboardForms dashboards={[{ ...DASHBOARDS[0], widgets: ['todo', 'mail'] }]} />)
      expect(screen.queryByText(/Retire les widgets sensibles/)).not.toBeInTheDocument()
      await user.selectOptions(within(screen.getByDisplayValue('Perso').closest('form') as HTMLFormElement).getByLabelText('Visibilité'), 'public')
      expect(screen.getByText(/Retire les widgets sensibles avant d’enregistrer/)).toBeInTheDocument()
      await user.click(openPicker())
      expect(screen.getByRole('checkbox', { name: /^Activités/ })).toBeDisabled()
    })

    it('après la réinitialisation du formulaire, le sélecteur ne traite plus Perso comme public', async () => {
      const user = userEvent.setup()
      render(<DashboardForms dashboards={persoOnly} />)
      const form = screen.getByDisplayValue('Perso').closest('form') as HTMLFormElement
      await user.selectOptions(within(form).getByLabelText('Visibilité'), 'public')
      await user.click(openPicker())
      expect(screen.getByRole('checkbox', { name: /^Mails/ })).toBeDisabled()
      await user.click(screen.getByRole('button', { name: 'Annuler' }))
      fireEvent.reset(form)
      await user.click(openPicker())
      expect(screen.getByRole('checkbox', { name: /^Mails/ })).toBeEnabled()
    })

    it('ne donne pas de nom aux cases du sélecteur : elles ne sont jamais postées', async () => {
      const user = userEvent.setup()
      render(<DashboardForms dashboards={persoOnly} />)
      await user.click(openPicker())
      for (const box of screen.getAllByRole('checkbox')) expect(box).not.toHaveAttribute('name')
    })

    it('désactive le déclencheur et l’explique quand tous les widgets sont sur le dashboard', () => {
      render(<DashboardForms dashboards={[{ ...DASHBOARDS[0], widgets: [...WIDGETS.map((w) => w.id)] }]} />)
      expect(openPicker()).toBeDisabled()
      expect(screen.getByText('Tous les widgets sont déjà sur ce dashboard.')).toBeInTheDocument()
    })
  })

  it('rend les widgets en champs cachés et initialWidgets côté serveur (sans JavaScript)', () => {
    const html = renderToString(<DashboardForms dashboards={DASHBOARDS} />)
    expect(html).toContain('name="widgets" value="todo"')
    expect(html).toContain('name="initialWidgets"')
  })
})
