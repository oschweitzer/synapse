// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { addCity, findCities } from '@/app/actions/weather'
import { CityAutocomplete } from './CityAutocomplete'

vi.mock('@/app/actions/weather', () => ({ findCities: vi.fn(), addCity: vi.fn() }))

const strasbourg = { label: 'Strasbourg', detail: 'Grand Est, France', latitude: 48.58, longitude: 7.75 }
const strasbourgUs = { label: 'Strasbourg', detail: 'Saskatchewan, Canada', latitude: 51.07, longitude: -104.9 }

beforeEach(() => {
  vi.clearAllMocks()
})

const input = () => screen.getByRole('combobox', { name: 'Rechercher une ville' })
const addButton = () => screen.getByRole('button', { name: 'Ajouter' })

describe('CityAutocomplete', () => {
  it('un seul caractère : findCities n’est pas appelé', async () => {
    render(<CityAutocomplete full={false} max={5} />)
    await userEvent.setup().type(input(), 'S')
    await new Promise((resolve) => setTimeout(resolve, 450))
    expect(findCities).not.toHaveBeenCalled()
  })

  it('« Stras » : findCities appelé une fois après la pause, suggestions dans une listbox avec le détail', async () => {
    vi.mocked(findCities).mockResolvedValue({ results: [strasbourg, strasbourgUs] })
    render(<CityAutocomplete full={false} max={5} />)
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
    render(<CityAutocomplete full={false} max={5} />)
    expect(input()).toHaveAttribute('aria-expanded', 'false')
    await userEvent.setup().type(input(), 'Stras')
    await screen.findByRole('option')
    expect(input()).toHaveAttribute('aria-expanded', 'true')
  })

  it('aucun résultat : « Aucune ville trouvée pour « Zzz ». »', async () => {
    vi.mocked(findCities).mockResolvedValue({ results: [] })
    render(<CityAutocomplete full={false} max={5} />)
    await userEvent.setup().type(input(), 'Zzz')
    expect(await screen.findByText('Aucune ville trouvée pour « Zzz ».')).toBeInTheDocument()
  })

  it('findCities renvoie { error } : erreur en role="alert"', async () => {
    vi.mocked(findCities).mockResolvedValue({ error: 'Recherche impossible : Open-Meteo ne répond pas.' })
    render(<CityAutocomplete full={false} max={5} />)
    await userEvent.setup().type(input(), 'Stras')
    expect(await screen.findByRole('alert')).toHaveTextContent('Recherche impossible : Open-Meteo ne répond pas.')
  })

  it('« Ajouter » désactivé avant le choix ; flèche bas puis Entrée choisit la première suggestion', async () => {
    vi.mocked(findCities).mockResolvedValue({ results: [strasbourg, strasbourgUs] })
    const user = userEvent.setup()
    render(<CityAutocomplete full={false} max={5} />)
    expect(addButton()).toBeDisabled()
    await user.type(input(), 'Stras')
    await screen.findAllByRole('option')
    expect(addButton()).toBeDisabled()
    await user.keyboard('{ArrowDown}{Enter}')
    expect(input()).toHaveValue('Strasbourg')
    expect(screen.queryByRole('option')).not.toBeInTheDocument()
    expect(addButton()).toBeEnabled()
    expect(addCity).not.toHaveBeenCalled()
  })

  it('Échap ferme la liste', async () => {
    vi.mocked(findCities).mockResolvedValue({ results: [strasbourg] })
    const user = userEvent.setup()
    render(<CityAutocomplete full={false} max={5} />)
    await user.type(input(), 'Stras')
    await screen.findByRole('option')
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('option')).not.toBeInTheDocument()
    expect(input()).toHaveAttribute('aria-expanded', 'false')
  })

  it('modifier le champ après un choix désactive de nouveau « Ajouter »', async () => {
    vi.mocked(findCities).mockResolvedValue({ results: [strasbourg] })
    const user = userEvent.setup()
    render(<CityAutocomplete full={false} max={5} />)
    await user.type(input(), 'Stras')
    await user.click(await screen.findByRole('option'))
    expect(addButton()).toBeEnabled()
    await user.type(input(), 'x')
    expect(addButton()).toBeDisabled()
  })

  it('clic sur « Ajouter » : addCity appelé avec la ville, statut « Ville ajoutée. », champ vidé', async () => {
    vi.mocked(findCities).mockResolvedValue({ results: [strasbourg] })
    vi.mocked(addCity).mockResolvedValue({})
    const user = userEvent.setup()
    render(<CityAutocomplete full={false} max={5} />)
    await user.type(input(), 'Stras')
    await user.click(await screen.findByRole('option'))
    await user.click(addButton())
    expect(addCity).toHaveBeenCalledWith({ label: 'Strasbourg', latitude: 48.58, longitude: 7.75 })
    expect(await screen.findByRole('status')).toHaveTextContent('Ville ajoutée.')
    expect(input()).toHaveValue('')
    expect(addButton()).toBeDisabled()
  })

  it('addCity renvoie { error } : erreur en role="alert", choix conservé', async () => {
    vi.mocked(findCities).mockResolvedValue({ results: [strasbourg] })
    vi.mocked(addCity).mockResolvedValue({ error: 'Enregistrement impossible, réessaie.' })
    const user = userEvent.setup()
    render(<CityAutocomplete full={false} max={5} />)
    await user.type(input(), 'Stras')
    await user.click(await screen.findByRole('option'))
    await user.click(addButton())
    expect(await screen.findByRole('alert')).toHaveTextContent('Enregistrement impossible, réessaie.')
    expect(input()).toHaveValue('Strasbourg')
    expect(addButton()).toBeEnabled()
  })

  it('findCities rejette : erreur en role="alert" dans la liste, plus de chargement', async () => {
    vi.mocked(findCities).mockRejectedValue(new Error('réseau'))
    render(<CityAutocomplete full={false} max={5} />)
    await userEvent.setup().type(input(), 'Stras')
    expect(await screen.findByRole('alert')).toHaveTextContent('Recherche impossible : Open-Meteo ne répond pas.')
    expect(input()).not.toHaveAttribute('aria-busy')
    expect(input()).toHaveAttribute('aria-expanded', 'true')
  })

  it('addCity rejette : erreur en place en role="alert", choix conservé', async () => {
    vi.mocked(findCities).mockResolvedValue({ results: [strasbourg] })
    vi.mocked(addCity).mockRejectedValue(new Error('réseau'))
    const user = userEvent.setup()
    render(<CityAutocomplete full={false} max={5} />)
    await user.type(input(), 'Stras')
    await user.click(await screen.findByRole('option'))
    await user.click(addButton())
    expect(await screen.findByRole('alert')).toHaveTextContent('Enregistrement impossible, réessaie.')
    expect(input()).toHaveValue('Strasbourg')
    expect(addButton()).toBeEnabled()
  })

  it('perdre puis retrouver le focus rouvre la liste des suggestions', async () => {
    vi.mocked(findCities).mockResolvedValue({ results: [strasbourg] })
    const user = userEvent.setup()
    render(<CityAutocomplete full={false} max={5} />)
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
    render(<CityAutocomplete full={false} max={5} />)
    await user.type(input(), 'Stras')
    await screen.findByRole('option')
    await user.type(input(), 'b')
    expect(screen.queryByRole('option')).not.toBeInTheDocument()
    expect(input()).toHaveAttribute('aria-expanded', 'false')
  })

  it('full : champ et « Ajouter » désactivés, indication du maximum affichée', () => {
    render(<CityAutocomplete full max={5} />)
    expect(input()).toBeDisabled()
    expect(addButton()).toBeDisabled()
    expect(screen.getByText('5 villes au plus : retires-en une pour en ajouter une autre.')).toBeInTheDocument()
  })
})
