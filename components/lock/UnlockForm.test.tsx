// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { startAuthentication } from '@simplewebauthn/browser'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UnlockForm } from './UnlockForm'

vi.mock('@simplewebauthn/browser', () => ({ startAuthentication: vi.fn() }))

const assign = vi.fn()
let fetchMock: ReturnType<typeof vi.fn>

/** Réponses par URL ; une URL absente répond 200 avec `{}`. */
function stubFetch(routes: Record<string, { ok?: boolean; body?: unknown }>) {
  fetchMock = vi.fn(async (url: string) => {
    const route = routes[url] ?? {}
    return { ok: route.ok ?? true, json: async () => route.body ?? {} }
  })
  vi.stubGlobal('fetch', fetchMock)
}

function stubPasskeys(available: boolean) {
  vi.stubGlobal('PublicKeyCredential', { isUserVerifyingPlatformAuthenticatorAvailable: vi.fn().mockResolvedValue(available) })
}

beforeEach(() => {
  assign.mockReset()
  // Le `assign` du vrai jsdom ne navigue pas et ne peut pas être espionné : on remplace `location`.
  vi.stubGlobal('location', { ...window.location, assign })
  stubFetch({})
})

describe('UnlockForm', () => {
  it('garde Déverrouiller désactivé tant que le code est vide', async () => {
    render(<UnlockForm next="/" hasPasskeys={false} />)
    const button = screen.getByRole('button', { name: 'Déverrouiller' })
    expect(button).toBeDisabled()
    await userEvent.setup().type(screen.getByLabelText('Code de déverrouillage'), '1234')
    expect(button).toBeEnabled()
  })

  it('code correct: POST /api/lock/verify avec { code }, puis location.assign(next)', async () => {
    stubFetch({ '/api/lock/verify': { ok: true, body: {} } })
    const user = userEvent.setup()
    render(<UnlockForm next="/cash" hasPasskeys={false} />)
    await user.type(screen.getByLabelText('Code de déverrouillage'), '1234')
    await user.click(screen.getByRole('button', { name: 'Déverrouiller' }))
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/cash'))
    expect(fetchMock).toHaveBeenCalledWith('/api/lock/verify', expect.objectContaining({ method: 'POST', body: JSON.stringify({ code: '1234' }) }))
  })

  it('code refusé: message de l’API en role="alert", champ vidé, pas de navigation', async () => {
    stubFetch({ '/api/lock/verify': { ok: false, body: { error: 'Code incorrect.' } } })
    const user = userEvent.setup()
    render(<UnlockForm next="/" hasPasskeys={false} />)
    await user.type(screen.getByLabelText('Code de déverrouillage'), '0000')
    await user.click(screen.getByRole('button', { name: 'Déverrouiller' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Code incorrect.')
    expect(screen.getByLabelText('Code de déverrouillage')).toHaveValue('')
    expect(assign).not.toHaveBeenCalled()
  })

  it("réponse sans error: message 'Vérification impossible, réessaie.'", async () => {
    stubFetch({ '/api/lock/verify': { ok: false, body: {} } })
    const user = userEvent.setup()
    render(<UnlockForm next="/" hasPasskeys={false} />)
    await user.type(screen.getByLabelText('Code de déverrouillage'), '0000')
    await user.click(screen.getByRole('button', { name: 'Déverrouiller' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Vérification impossible, réessaie.')
  })

  it("réponse signedOut: location.assign('/login')", async () => {
    stubFetch({ '/api/lock/verify': { ok: false, body: { signedOut: true } } })
    const user = userEvent.setup()
    render(<UnlockForm next="/" hasPasskeys={false} />)
    await user.type(screen.getByLabelText('Code de déverrouillage'), '0000')
    await user.click(screen.getByRole('button', { name: 'Déverrouiller' }))
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/login'))
  })

  it('sans passkeys: pas de bouton d’empreinte', async () => {
    stubPasskeys(true)
    render(<UnlockForm next="/" hasPasskeys={false} />)
    await Promise.resolve()
    expect(screen.queryByRole('button', { name: 'Utiliser l’empreinte' })).not.toBeInTheDocument()
  })

  it('sans PublicKeyCredential: pas de bouton d’empreinte', async () => {
    render(<UnlockForm next="/" hasPasskeys />)
    await Promise.resolve()
    expect(screen.queryByRole('button', { name: 'Utiliser l’empreinte' })).not.toBeInTheDocument()
  })

  it('avec passkeys et authentificateur disponible: clic -> auth-options, startAuthentication, auth-verify, puis location.assign(next)', async () => {
    stubPasskeys(true)
    stubFetch({ '/api/lock/passkey/auth-options': { body: { challenge: 'abc' } } })
    vi.mocked(startAuthentication).mockResolvedValue({ id: 'cred' } as never)
    render(<UnlockForm next="/mind" hasPasskeys />)
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Utiliser l’empreinte' }))
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/mind'))
    expect(startAuthentication).toHaveBeenCalledWith({ optionsJSON: { challenge: 'abc' } })
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual(['/api/lock/passkey/auth-options', '/api/lock/passkey/auth-verify'])
    expect(fetchMock).toHaveBeenLastCalledWith('/api/lock/passkey/auth-verify', expect.objectContaining({ body: JSON.stringify({ response: { id: 'cred' } }) }))
  })

  it('empreinte annulée (NotAllowedError): message d’annulation, pas de navigation', async () => {
    stubPasskeys(true)
    const cancelled = new Error('cancelled')
    cancelled.name = 'NotAllowedError'
    vi.mocked(startAuthentication).mockRejectedValue(cancelled)
    render(<UnlockForm next="/" hasPasskeys />)
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Utiliser l’empreinte' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Empreinte annulée. Tu peux saisir ton code.')
    expect(assign).not.toHaveBeenCalled()
  })
})
