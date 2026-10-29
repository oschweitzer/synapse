// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderToString } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { addHabit, archiveHabit } from '@/app/actions/mood'
import { HabitsForms } from './HabitsForms'

vi.mock('@/app/actions/mood', () => ({ addHabit: vi.fn(), archiveHabit: vi.fn() }))

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

// jsdom ne garde pas l'espace avant le texte masqué (« Retirer« Lire »») : un navigateur donne « Retirer « Lire » ».
const MAX = 3
const HABITS = [
  { id: 'h1', name: 'Lire' },
  { id: 'h2', name: 'Marcher' },
]

beforeEach(() => {
  postback.action = null
  postback.state = null
  vi.mocked(addHabit).mockReset()
  vi.mocked(archiveHabit).mockReset()
})

describe('HabitsForms', () => {
  it('rend la liste, un bouton Retirer par habitude et le formulaire d’ajout', () => {
    render(<HabitsForms habits={HABITS} max={MAX} />)
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByRole('button', { name: /^Retirer\s*« Lire »$/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Retirer\s*« Marcher »$/ })).toBeInTheDocument()
    expect(screen.getByLabelText('Nouvelle habitude')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ajouter' })).toBeInTheDocument()
  })

  it('indique qu’il n’y a aucune habitude quand la liste est vide', () => {
    render(<HabitsForms habits={[]} max={MAX} />)
    expect(screen.getByText('Aucune habitude pour l’instant.')).toBeInTheDocument()
  })

  it('affiche l’alerte de lecture et garde le formulaire d’ajout quand habits est null', () => {
    render(<HabitsForms habits={null} max={MAX} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Lecture des habitudes impossible.')
    expect(screen.getByLabelText('Nouvelle habitude')).toBeInTheDocument()
  })

  it('masque le formulaire d’ajout au maximum d’habitudes', () => {
    render(<HabitsForms habits={[...HABITS, { id: 'h3', name: 'Méditer' }]} max={MAX} />)
    expect(screen.queryByLabelText('Nouvelle habitude')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ajouter' })).not.toBeInTheDocument()
  })

  it('garde le nom saisi et affiche l’erreur quand l’ajout échoue', async () => {
    vi.mocked(addHabit).mockResolvedValue({ code: 'max', at: 1, name: 'Lire' })
    render(<HabitsForms habits={HABITS} max={MAX} />)
    await userEvent.setup().type(screen.getByLabelText('Nouvelle habitude'), 'Lire{Enter}')
    expect(await screen.findByRole('alert')).toHaveTextContent(`${MAX} habitudes au plus : retires-en une d’abord.`)
    expect(screen.getByLabelText('Nouvelle habitude')).toHaveValue('Lire')
  })

  it('vide le champ et confirme quand l’ajout réussit', async () => {
    vi.mocked(addHabit).mockResolvedValue({ code: 'added', at: 2 })
    render(<HabitsForms habits={HABITS} max={MAX} />)
    await userEvent.setup().type(screen.getByLabelText('Nouvelle habitude'), 'Lire{Enter}')
    expect(await screen.findByRole('status')).toHaveTextContent('Habitude ajoutée.')
    expect(screen.getByLabelText('Nouvelle habitude')).toHaveValue('')
  })

  it('n’affiche que le dernier message : un retrait après un ajout remplace « ajoutée »', async () => {
    vi.mocked(addHabit).mockResolvedValue({ code: 'added', at: 1 })
    vi.mocked(archiveHabit).mockResolvedValue({ code: 'archived', at: 2 })
    const user = userEvent.setup()
    render(<HabitsForms habits={HABITS} max={MAX} />)
    await user.type(screen.getByLabelText('Nouvelle habitude'), 'Lire{Enter}')
    expect(await screen.findByText('Habitude ajoutée.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^Retirer\s*« Lire »$/ }))
    expect(await screen.findByText(/Habitude retirée/)).toBeInTheDocument()
    expect(screen.queryByText('Habitude ajoutée.')).not.toBeInTheDocument()
    expect(screen.getAllByRole('status')).toHaveLength(1)
  })

  it('affiche le dernier envoi même quand les deux horodatages sont égaux', async () => {
    vi.mocked(addHabit).mockResolvedValue({ code: 'added', at: 5 })
    vi.mocked(archiveHabit).mockResolvedValue({ code: 'archived', at: 5 })
    const user = userEvent.setup()
    render(<HabitsForms habits={HABITS} max={MAX} />)
    await user.type(screen.getByLabelText('Nouvelle habitude'), 'Lire{Enter}')
    expect(await screen.findByText('Habitude ajoutée.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^Retirer\s*« Lire »$/ }))
    expect(await screen.findByText(/Habitude retirée/)).toBeInTheDocument()
    expect(screen.queryByText('Habitude ajoutée.')).not.toBeInTheDocument()
  })

  it('un ajout après un retrait remplace « retirée » même avec un horodatage plus ancien', async () => {
    vi.mocked(archiveHabit).mockResolvedValue({ code: 'archived', at: 9 })
    vi.mocked(addHabit).mockResolvedValue({ code: 'added', at: 3 })
    const user = userEvent.setup()
    render(<HabitsForms habits={HABITS} max={MAX} />)
    await user.click(screen.getByRole('button', { name: /^Retirer\s*« Lire »$/ }))
    expect(await screen.findByText(/Habitude retirée/)).toBeInTheDocument()
    await user.type(screen.getByLabelText('Nouvelle habitude'), 'Lire{Enter}')
    expect(await screen.findByText('Habitude ajoutée.')).toBeInTheDocument()
    expect(screen.queryByText(/Habitude retirée/)).not.toBeInTheDocument()
  })

  it('garde l’erreur d’un retrait raté quand un retrait suivant réussit', async () => {
    vi.mocked(archiveHabit)
      .mockResolvedValueOnce({ code: 'save', at: 1 })
      .mockResolvedValueOnce({ code: 'archived', at: 2 })
    const user = userEvent.setup()
    render(<HabitsForms habits={HABITS} max={MAX} />)
    await user.click(screen.getByRole('button', { name: /^Retirer\s*« Lire »$/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Enregistrement impossible, réessaie.')
    await user.click(screen.getByRole('button', { name: /^Retirer\s*« Marcher »$/ }))
    expect(await screen.findByText(/Habitude retirée/)).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Enregistrement impossible, réessaie.')
  })

  it('efface l’erreur d’un retrait quand la même habitude est retirée de nouveau avec succès', async () => {
    vi.mocked(archiveHabit)
      .mockResolvedValueOnce({ code: 'save', at: 1 })
      .mockResolvedValueOnce({ code: 'archived', at: 2 })
    const user = userEvent.setup()
    render(<HabitsForms habits={HABITS} max={MAX} />)
    await user.click(screen.getByRole('button', { name: /^Retirer\s*« Lire »$/ }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^Retirer\s*« Lire »$/ }))
    expect(await screen.findByText(/Habitude retirée/)).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('un code inconnu retombe sur le message d’enregistrement impossible', async () => {
    vi.mocked(addHabit).mockResolvedValue({ code: 'whatever', at: 1, name: 'Lire' })
    render(<HabitsForms habits={HABITS} max={MAX} />)
    await userEvent.setup().type(screen.getByLabelText('Nouvelle habitude'), 'Lire{Enter}')
    expect(await screen.findByRole('alert')).toHaveTextContent('Enregistrement impossible, réessaie.')
  })

  it('rend l’action serveur comme action du formulaire : le retrait reste possible sans JavaScript', () => {
    // Une action serveur porte `$$FORM_ACTION` : au rendu serveur React en tire l'URL du formulaire. Une fonction
    // enveloppante la perdrait, et l'envoi sans JS tomberait sur `javascript:throw new Error(…)`.
    // Comme une vraie action serveur, le mock porte `$$FORM_ACTION` et le garde une fois lié (`bind`) par React.
    const fields = { action: '/archive-sans-js', method: 'POST', encType: 'multipart/form-data', target: undefined, data: null }
    const bound = Object.assign(() => {}, { $$FORM_ACTION: () => ({ ...fields }) })
    const serverAction = archiveHabit as unknown as { $$FORM_ACTION?: unknown; bind?: unknown }
    serverAction.$$FORM_ACTION = () => ({ ...fields })
    serverAction.bind = () => bound
    try {
      const html = renderToString(<HabitsForms habits={HABITS} max={MAX} />)
      // Un formulaire par habitude ; le formulaire d'ajout (mock sans `$$FORM_ACTION`) n'est pas concerné.
      expect(html.match(/<form action="\/archive-sans-js"/g)).toHaveLength(HABITS.length)
    } finally {
      delete serverAction.$$FORM_ACTION
      delete serverAction.bind
    }
  })

  it('appelle l’action serveur avec (null, FormData) au premier retrait', async () => {
    vi.mocked(archiveHabit).mockResolvedValue({ code: 'archived', at: 1 })
    render(<HabitsForms habits={HABITS} max={MAX} />)
    await userEvent.setup().click(screen.getByRole('button', { name: /^Retirer\s*« Lire »$/ }))
    await screen.findByText(/Habitude retirée/)
    const [prev, formData] = vi.mocked(archiveHabit).mock.calls[0]
    expect(prev).toBeNull()
    expect(formData).toBeInstanceOf(FormData)
    expect(formData.get('id')).toBe('h1')
  })

  it('affiche le retour d’un retrait revenu d’un envoi sans JavaScript, où aucun onSubmit n’a tourné', () => {
    postback.action = archiveHabit
    postback.state = { code: 'archived', at: 1 }
    expect(renderToString(<HabitsForms habits={HABITS} max={MAX} />)).toContain('Habitude retirée')
  })

  it('affiche le retour d’un ajout revenu d’un envoi sans JavaScript', () => {
    postback.action = addHabit
    postback.state = { code: 'added', at: 1 }
    expect(renderToString(<HabitsForms habits={HABITS} max={MAX} />)).toContain('Habitude ajoutée.')
  })
})
