// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { findCities } from '@/app/actions/weather'
import type { SectionState } from '@/lib/settings/section-state'
import { CityAutocomplete } from './CityAutocomplete'

vi.mock('@/app/actions/weather', () => ({ findCities: vi.fn() }))

const strasbourg = { label: 'Strasbourg', detail: 'Grand Est, France', latitude: 48.58, longitude: 7.75 }
const strasbourgUs = { label: 'Strasbourg', detail: 'Saskatchewan, Canada', latitude: 51.07, longitude: -104.9 }

const action = vi.fn()
const onSubmit = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
})

function ui(state: SectionState = null, pending = false, full = false) {
  return <CityAutocomplete full={full} max={5} action={action} onSubmit={onSubmit} state={state} pending={pending} />
}

const input = () => screen.getByRole('combobox', { name: 'Rechercher une ville' })
const addButton = () => screen.getByRole('button', { name: 'Ajouter' })

describe('CityAutocomplete', () => {
  it('un seul caractère : findCities n’est pas appelé', async () => {
    render(ui())
    await userEvent.setup().type(input(), 'S')
    await new Promise((resolve) => setTimeout(resolve, 450))
    expect(findCities).not.toHaveBeenCalled()
  })

  it('« Stras » : findCities appelé une fois après la pause, suggestions dans une listbox avec le détail', async () => {
    vi.mocked(findCities).mockResolvedValue({ results: [strasbourg, strasbourgUs] })
    render(ui())
    await userEvent.setup().type(input(), 'Stras')
    const options = await screen.findAllByRole('option')
    expect(options).toHaveLength(2)
    expect(screen.getByRole('listbox', { name: 'Suggestions de villes' })).toBeInTheDocument()
    expect(options[0]).toHaveTextContent('Strasbourg · Grand Est, France')
    await waitFor(() => expect(findCities).toHaveBeenCalledTimes(1))
    expect(findCities).toHaveBeenCalledWith('Stras')
  })

  it('le champ est un combobox, aria-expanded vrai quand les suggestions sont affichées', async () => {
    vi.mocked(findCities).mockResolvedValue({ results: [strasbourg] })
    render(ui())
    expect(input()).toHaveAttribute('aria-expanded', 'false')
    await userEvent.setup().type(input(), 'Stras')
    await screen.findByRole('option')
    expect(input()).toHaveAttribute('aria-expanded', 'true')
  })

  it('aucun résultat : « Aucune ville trouvée pour « Zzz ». »', async () => {
    vi.mocked(findCities).mockResolvedValue({ results: [] })
    render(ui())
    await userEvent.setup().type(input(), 'Zzz')
    expect(await screen.findByText('Aucune ville trouvée pour « Zzz ».')).toBeInTheDocument()
  })

  it('findCities renvoie { error } : erreur en role="alert"', async () => {
    vi.mocked(findCities).mockResolvedValue({ error: 'Recherche impossible : Open-Meteo ne répond pas.' })
    render(ui())
    await userEvent.setup().type(input(), 'Stras')
    expect(await screen.findByRole('alert')).toHaveTextContent('Recherche impossible : Open-Meteo ne répond pas.')
  })

  it('« Ajouter » désactivé avant le choix ; flèche bas puis Entrée choisit la première suggestion', async () => {
    vi.mocked(findCities).mockResolvedValue({ results: [strasbourg, strasbourgUs] })
    const user = userEvent.setup()
    render(ui())
    expect(addButton()).toBeDisabled()
    await user.type(input(), 'Stras')
    await screen.findAllByRole('option')
    expect(addButton()).toBeDisabled()
    await user.keyboard('{ArrowDown}{Enter}')
    expect(input()).toHaveValue('Strasbourg')
    expect(screen.queryByRole('option')).not.toBeInTheDocument()
    expect(addButton()).toBeEnabled()
    expect(action).not.toHaveBeenCalled()
  })

  it('Échap ferme la liste', async () => {
    vi.mocked(findCities).mockResolvedValue({ results: [strasbourg] })
    const user = userEvent.setup()
    render(ui())
    await user.type(input(), 'Stras')
    await screen.findByRole('option')
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('option')).not.toBeInTheDocument()
    expect(input()).toHaveAttribute('aria-expanded', 'false')
  })

  it('modifier le champ après un choix désactive de nouveau « Ajouter »', async () => {
    vi.mocked(findCities).mockResolvedValue({ results: [strasbourg] })
    const user = userEvent.setup()
    render(ui())
    await user.type(input(), 'Stras')
    await user.click(await screen.findByRole('option'))
    expect(addButton()).toBeEnabled()
    await user.type(input(), 'x')
    expect(addButton()).toBeDisabled()
  })

  async function chooseStrasbourg() {
    vi.mocked(findCities).mockResolvedValue({ results: [strasbourg] })
    const user = userEvent.setup()
    const view = render(ui())
    await user.type(input(), 'Stras')
    await user.click(await screen.findByRole('option'))
    return { user, view }
  }

  it('clic sur « Ajouter » : l’action est appelée une fois avec label, latitude et longitude', async () => {
    const { user } = await chooseStrasbourg()
    await user.click(addButton())
    expect(action).toHaveBeenCalledTimes(1)
    const data = action.mock.calls[0][0] as FormData
    expect(data.get('label')).toBe('Strasbourg')
    expect(data.get('latitude')).toBe('48.58')
    expect(data.get('longitude')).toBe('7.75')
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('Entrée sans ville choisie : ni action ni onSubmit', async () => {
    const user = userEvent.setup()
    render(ui())
    await user.type(input(), '{Enter}')
    expect(action).not.toHaveBeenCalled()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('état « added » : champ vidé et « Ajouter » désactivé', async () => {
    const { view } = await chooseStrasbourg()
    view.rerender(ui({ code: 'added', at: 1 }))
    expect(input()).toHaveValue('')
    expect(addButton()).toBeDisabled()
  })

  it('état « save » : la ville choisie reste dans le champ et « Ajouter » reste actif', async () => {
    const { view } = await chooseStrasbourg()
    view.rerender(ui({ code: 'save', at: 1 }))
    expect(input()).toHaveValue('Strasbourg')
    expect(addButton()).toBeEnabled()
  })

  it('envoi en cours : « Ajouter » occupé et désactivé', async () => {
    const { view } = await chooseStrasbourg()
    view.rerender(ui(null, true))
    expect(addButton()).toBeDisabled()
    expect(addButton()).toHaveAttribute('aria-busy', 'true')
  })

  it('sans ville choisie, Entrée n’envoie pas le formulaire', async () => {
    const user = userEvent.setup()
    render(ui())
    await user.type(input(), 'Stras{Enter}')
    expect(action).not.toHaveBeenCalled()
  })

  it('findCities rejette : erreur en role="alert" dans la liste, plus de chargement', async () => {
    vi.mocked(findCities).mockRejectedValue(new Error('réseau'))
    render(ui())
    await userEvent.setup().type(input(), 'Stras')
    expect(await screen.findByRole('alert')).toHaveTextContent('Recherche impossible : Open-Meteo ne répond pas.')
    expect(input()).not.toHaveAttribute('aria-busy')
    expect(input()).toHaveAttribute('aria-expanded', 'true')
  })

  it('perdre puis retrouver le focus rouvre la liste des suggestions', async () => {
    vi.mocked(findCities).mockResolvedValue({ results: [strasbourg] })
    const user = userEvent.setup()
    render(ui())
    await user.type(input(), 'Stras')
    await screen.findByRole('option')
    await user.tab()
    expect(screen.queryByRole('option')).not.toBeInTheDocument()
    await user.tab({ shift: true })
    expect(input()).toHaveFocus()
    expect(await screen.findByRole('option')).toHaveTextContent('Strasbourg')
    expect(input()).toHaveAttribute('aria-expanded', 'true')
  })

  it('modifier la saisie vide aussitôt les suggestions périmées', async () => {
    vi.mocked(findCities).mockResolvedValueOnce({ results: [strasbourg] })
    vi.mocked(findCities).mockReturnValueOnce(new Promise(() => {}))
    const user = userEvent.setup()
    render(ui())
    await user.type(input(), 'Stras')
    await screen.findByRole('option')
    await user.type(input(), 'b')
    expect(screen.queryByRole('option')).not.toBeInTheDocument()
    expect(input()).toHaveAttribute('aria-expanded', 'false')
  })

  it('full : champ et « Ajouter » désactivés, indication du maximum affichée', () => {
    render(ui(null, false, true))
    expect(input()).toBeDisabled()
    expect(addButton()).toBeDisabled()
    expect(screen.getByText('5 villes au plus : retires-en une pour en ajouter une autre.')).toBeInTheDocument()
  })
})
