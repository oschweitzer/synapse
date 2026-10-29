// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { addCity, findCities, moveCity, removeCity } from '@/app/actions/weather'
import { WeatherForms } from './WeatherForms'

vi.mock('@/app/actions/weather', () => ({ addCity: vi.fn(), moveCity: vi.fn(), removeCity: vi.fn(), findCities: vi.fn() }))

// jsdom ne garde pas l'espace avant le texte masqué (« Retirer« Lyon »») : un navigateur donne « Retirer « Lyon » ».
const MAX = 3
const CITIES = [{ id: 'default', label: 'Paris', latitude: 48.85, longitude: 2.35 }]
const TWO = [
  { id: 'c1', label: 'Strasbourg', latitude: 48.58, longitude: 7.75 },
  { id: 'c2', label: 'Lyon', latitude: 45.76, longitude: 4.83 },
]
const remove = (label: string) => screen.getByRole('button', { name: new RegExp(`^Retirer\\s*« ${label} »$`) })
const up = (label: string) => screen.getByRole('button', { name: new RegExp(`^Monter\\s*« ${label} »$`) })
const down = (label: string) => screen.getByRole('button', { name: new RegExp(`^Descendre\\s*« ${label} »$`) })
const search = () => screen.getByRole('combobox', { name: 'Rechercher une ville' })

beforeEach(() => {
  vi.mocked(addCity).mockReset()
  vi.mocked(findCities).mockReset()
  vi.mocked(moveCity).mockReset()
  vi.mocked(removeCity).mockReset()
})

describe('WeatherForms', () => {
  it('rend une ligne par ville avec Monter, Descendre et Retirer ; la ville par défaut n’en a pas', () => {
    render(<WeatherForms cities={[...CITIES, ...TWO]} max={MAX} />)
    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(3)
    expect(within(items[0]).queryByRole('button')).not.toBeInTheDocument()
    expect(within(items[1]).getAllByRole('button')).toHaveLength(3)
    expect(remove('Strasbourg')).toBeInTheDocument()
    expect(remove('Lyon')).toBeInTheDocument()
  })

  it('désactive Monter sur la première ville et Descendre sur la dernière', () => {
    render(<WeatherForms cities={TWO} max={MAX} />)
    expect(up('Strasbourg')).toBeDisabled()
    expect(down('Strasbourg')).toBeEnabled()
    expect(up('Lyon')).toBeEnabled()
    expect(down('Lyon')).toBeDisabled()
  })

  it('affiche l’alerte de lecture et garde le champ de recherche quand cities est null', () => {
    render(<WeatherForms cities={null} max={MAX} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Lecture des villes impossible.')
    expect(search()).toBeEnabled()
  })

  it('désactive la recherche quand le nombre de villes (hors Paris par défaut) atteint le maximum', () => {
    const three = [...TWO, { id: 'c3', label: 'Nice', latitude: 43.7, longitude: 7.26 }]
    render(<WeatherForms cities={three} max={MAX} />)
    expect(search()).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Ajouter' })).toBeDisabled()
  })

  it('ne compte pas la ville par défaut dans le maximum', () => {
    render(<WeatherForms cities={CITIES} max={1} />)
    expect(search()).toBeEnabled()
  })

  it('Retirer appelle removeCity avec (null, FormData{id}) et affiche « Ville retirée. »', async () => {
    vi.mocked(removeCity).mockResolvedValue({ code: 'removed', at: 1 })
    render(<WeatherForms cities={TWO} max={MAX} />)
    await userEvent.setup().click(remove('Lyon'))
    expect(await screen.findByRole('status')).toHaveTextContent('Ville retirée.')
    const [prev, data] = vi.mocked(removeCity).mock.calls[0]
    expect(prev).toBeNull()
    expect(data.get('id')).toBe('c2')
  })

  it('Monter appelle moveCity avec l’id et la direction -1 et affiche « Ordre enregistré. »', async () => {
    vi.mocked(moveCity).mockResolvedValue({ code: 'moved', at: 1 })
    render(<WeatherForms cities={TWO} max={MAX} />)
    await userEvent.setup().click(up('Lyon'))
    expect(await screen.findByRole('status')).toHaveTextContent('Ordre enregistré.')
    const data = vi.mocked(moveCity).mock.calls[0][1]
    expect(data.get('id')).toBe('c2')
    expect(data.get('direction')).toBe('-1')
  })

  it('Descendre envoie la direction 1', async () => {
    vi.mocked(moveCity).mockResolvedValue({ code: 'moved', at: 1 })
    render(<WeatherForms cities={TWO} max={MAX} />)
    await userEvent.setup().click(down('Strasbourg'))
    await screen.findByRole('status')
    expect(vi.mocked(moveCity).mock.calls[0][1].get('direction')).toBe('1')
  })

  it('un code inconnu affiche l’alerte d’enregistrement impossible', async () => {
    vi.mocked(removeCity).mockResolvedValue({ code: 'whatever', at: 1 })
    render(<WeatherForms cities={TWO} max={MAX} />)
    await userEvent.setup().click(remove('Lyon'))
    expect(await screen.findByRole('alert')).toHaveTextContent('Enregistrement impossible, réessaie.')
  })

  it('le code « max » affiche le message du nombre maximal', async () => {
    vi.mocked(removeCity).mockResolvedValue({ code: 'max', at: 1 })
    render(<WeatherForms cities={TWO} max={MAX} />)
    await userEvent.setup().click(remove('Lyon'))
    expect(await screen.findByRole('alert')).toHaveTextContent(`${MAX} villes au plus : retires-en une d’abord.`)
  })

  it('le code « invalid » affiche « Ville invalide. »', async () => {
    vi.mocked(moveCity).mockResolvedValue({ code: 'invalid', at: 1 })
    render(<WeatherForms cities={TWO} max={MAX} />)
    await userEvent.setup().click(up('Lyon'))
    expect(await screen.findByRole('alert')).toHaveTextContent('Ville invalide.')
  })

  it('après un retrait puis un déplacement, seul le message du déplacement reste', async () => {
    vi.mocked(removeCity).mockResolvedValue({ code: 'removed', at: 1 })
    vi.mocked(moveCity).mockResolvedValue({ code: 'moved', at: 2 })
    const user = userEvent.setup()
    render(<WeatherForms cities={TWO} max={MAX} />)
    await user.click(remove('Strasbourg'))
    expect(await screen.findByText('Ville retirée.')).toBeInTheDocument()
    await user.click(up('Lyon'))
    expect(await screen.findByText('Ordre enregistré.')).toBeInTheDocument()
    expect(screen.queryByText('Ville retirée.')).not.toBeInTheDocument()
    expect(screen.getAllByRole('status')).toHaveLength(1)
  })

  it('le message est celui du dernier envoi, même si son horodatage serveur est plus ancien', async () => {
    vi.mocked(removeCity).mockResolvedValue({ code: 'removed', at: 2000 })
    vi.mocked(moveCity).mockResolvedValue({ code: 'moved', at: 1000 })
    const user = userEvent.setup()
    render(<WeatherForms cities={TWO} max={MAX} />)
    await user.click(remove('Strasbourg'))
    expect(await screen.findByText('Ville retirée.')).toBeInTheDocument()
    await user.click(up('Lyon'))
    expect(await screen.findByText('Ordre enregistré.')).toBeInTheDocument()
    expect(screen.queryByText('Ville retirée.')).not.toBeInTheDocument()
  })

  it('ajout réussi : « Ville ajoutée. » affiché et champ vidé', async () => {
    vi.mocked(findCities).mockResolvedValue({
      results: [{ label: 'Nice', detail: 'PACA, France', latitude: 43.7, longitude: 7.26 }],
    })
    vi.mocked(addCity).mockResolvedValue({ code: 'added', at: 1 })
    const user = userEvent.setup()
    render(<WeatherForms cities={TWO} max={MAX} />)
    await user.type(search(), 'Nice')
    await user.click(await screen.findByRole('option'))
    await user.click(screen.getByRole('button', { name: 'Ajouter' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Ville ajoutée.')
    expect(search()).toHaveValue('')
    const data = vi.mocked(addCity).mock.calls[0][1]
    expect(data.get('label')).toBe('Nice')
  })
})
