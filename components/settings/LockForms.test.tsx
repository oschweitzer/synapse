// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderToString } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { disableLock, removePasskey, saveLockCode, saveLockIdle } from '@/app/actions/lock'
import { LockForms } from './LockForms'

vi.mock('@/app/actions/lock', () => ({ saveLockCode: vi.fn(), saveLockIdle: vi.fn(), disableLock: vi.fn(), removePasskey: vi.fn() }))
vi.mock('@/components/lock/PasskeyEnroll', () => ({ PasskeyEnroll: () => null }))

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

const LOCK = { idleMinutes: 15 }
const PASSKEYS = [{ id: 'p1', label: 'Pixel', used: 'jamais utilisée' }]
const props = { codeMin: 6, lock: LOCK, passkeys: PASSKEYS }

beforeEach(() => {
  postback.action = null
  postback.state = null
  for (const action of [saveLockCode, saveLockIdle, disableLock, removePasskey]) vi.mocked(action).mockReset()
})

describe('LockForms : rendu', () => {
  it('sans verrouillage : premier réglage, aucun autre formulaire', () => {
    render(<LockForms codeMin={6} lock={null} passkeys={[]} />)
    expect(screen.getByLabelText('Code')).toBeInTheDocument()
    expect(screen.getByLabelText('Confirmer le code')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Activer le verrouillage' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Code actuel')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Verrouiller après')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Verrouiller maintenant' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Désactiver le verrouillage' })).not.toBeInTheDocument()
    expect(screen.queryByText('Empreintes')).not.toBeInTheDocument()
  })

  it('avec verrouillage : changement de code, délai sélectionné, « Verrouiller maintenant » et désactivation', () => {
    render(<LockForms {...props} />)
    expect(screen.getByLabelText('Code actuel')).toBeInTheDocument()
    expect(screen.getByLabelText('Nouveau code')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Changer le code' })).toBeInTheDocument()
    expect(screen.getByLabelText('Verrouiller après')).toHaveValue('15')
    const lockNow = screen.getByRole('button', { name: 'Verrouiller maintenant' })
    expect(lockNow.closest('form')).toHaveAttribute('action', '/api/lock/lock')
    expect(lockNow.closest('form')).toHaveAttribute('method', 'post')
    expect(screen.getByLabelText('Code actuel pour désactiver')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Désactiver le verrouillage' })).toBeInTheDocument()
  })

  it('un nouveau délai revalidé est sélectionné dans la liste', () => {
    const { rerender } = render(<LockForms {...props} />)
    rerender(<LockForms {...props} lock={{ idleMinutes: 1 }} />)
    expect(screen.getByLabelText('Verrouiller après')).toHaveValue('1')
  })

  it('empreintes : alerte si illisibles, message si aucune, ligne avec « Retirer » sinon', () => {
    const { rerender } = render(<LockForms {...props} passkeys={null} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Lecture des appareils impossible.')
    rerender(<LockForms {...props} passkeys={[]} />)
    expect(screen.getByText('Aucun appareil enregistré.')).toBeInTheDocument()
    rerender(<LockForms {...props} />)
    expect(screen.getByRole('listitem')).toHaveTextContent('Pixel · jamais utilisée')
    expect(screen.getByRole('button', { name: /^Retirer\s*« Pixel »$/ })).toBeInTheDocument()
  })
})

describe('LockForms : actions', () => {
  it('l’activation appelle saveLockCode avec (null, FormData) et affiche le statut ; la revalidation le garde', async () => {
    vi.mocked(saveLockCode).mockResolvedValue({ code: 'enabled', at: 1 })
    const user = userEvent.setup()
    const { rerender } = render(<LockForms codeMin={6} lock={null} passkeys={[]} />)
    await user.type(screen.getByLabelText('Code'), 'secret-1')
    await user.type(screen.getByLabelText('Confirmer le code'), 'secret-1')
    await user.click(screen.getByRole('button', { name: 'Activer le verrouillage' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Verrouillage activé. Le dashboard se verrouille après inactivité.')
    const [prev, formData] = vi.mocked(saveLockCode).mock.calls[0]
    expect(prev).toBeNull()
    expect(formData).toBeInstanceOf(FormData)
    expect((formData as FormData).get('code')).toBe('secret-1')
    rerender(<LockForms {...props} />)
    expect(screen.getByRole('button', { name: 'Changer le code' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Verrouillage activé.')
  })

  it('messages d’erreur : temporisation, code actuel faux, code inconnu', async () => {
    const user = userEvent.setup()
    render(<LockForms {...props} />)
    const disable = screen.getByRole('button', { name: 'Désactiver le verrouillage' })
    const current = screen.getByLabelText('Code actuel pour désactiver')

    vi.mocked(disableLock).mockResolvedValueOnce({ code: 'throttled-30', at: 1 })
    await user.type(current, 'x')
    await user.click(disable)
    expect(await screen.findByRole('alert')).toHaveTextContent('Trop d’essais. Réessaie dans 30 s.')

    vi.mocked(disableLock).mockResolvedValueOnce({ code: 'current', at: 2 })
    await user.type(current, 'x')
    await user.click(disable)
    expect(await screen.findByText('Code actuel incorrect.')).toBeInTheDocument()

    vi.mocked(disableLock).mockResolvedValueOnce({ code: 'inconnu', at: 3 })
    await user.type(current, 'x')
    await user.click(disable)
    expect(await screen.findByText('Enregistrement impossible, réessaie.')).toBeInTheDocument()
  })

  it('le message de longueur utilise codeMin', async () => {
    vi.mocked(saveLockCode).mockResolvedValue({ code: 'short', at: 1 })
    const user = userEvent.setup()
    render(<LockForms codeMin={4} lock={null} passkeys={[]} />)
    await user.type(screen.getByLabelText('Code'), 'abcd')
    await user.type(screen.getByLabelText('Confirmer le code'), 'abcd')
    await user.click(screen.getByRole('button', { name: 'Activer le verrouillage' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Le code doit faire 4 caractères au moins.')
  })

  it('délai puis désactivation : seul le message du dernier formulaire envoyé reste', async () => {
    vi.mocked(saveLockIdle).mockResolvedValue({ code: 'idle', at: 1 })
    vi.mocked(disableLock).mockResolvedValue({ code: 'disabled', at: 2 })
    const user = userEvent.setup()
    render(<LockForms {...props} />)
    await user.click(screen.getByRole('button', { name: 'Enregistrer le délai' }))
    expect(await screen.findByText('Délai enregistré.')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Code actuel pour désactiver'), 'ok')
    await user.click(screen.getByRole('button', { name: 'Désactiver le verrouillage' }))
    expect(await screen.findByText('Verrouillage désactivé.')).toBeInTheDocument()
    expect(screen.queryByText('Délai enregistré.')).not.toBeInTheDocument()
    expect(screen.getAllByRole('status')).toHaveLength(1)
  })

  it('retirer une empreinte envoie son id et affiche le statut', async () => {
    vi.mocked(removePasskey).mockResolvedValue({ code: 'revoked', at: 1 })
    render(<LockForms {...props} />)
    await userEvent.setup().click(screen.getByRole('button', { name: /^Retirer\s*« Pixel »$/ }))
    expect(await screen.findByRole('status')).toHaveTextContent('Empreinte retirée.')
    expect((vi.mocked(removePasskey).mock.calls[0][1] as FormData).get('id')).toBe('p1')
  })

  it('après une désactivation, le rendu sans verrouillage (revalidation) revient au premier réglage et garde le message', async () => {
    vi.mocked(disableLock).mockResolvedValue({ code: 'disabled', at: 1 })
    const user = userEvent.setup()
    const { rerender } = render(<LockForms {...props} />)
    await user.type(screen.getByLabelText('Code actuel pour désactiver'), 'ok')
    await user.click(screen.getByRole('button', { name: 'Désactiver le verrouillage' }))
    await screen.findByText('Verrouillage désactivé.')
    rerender(<LockForms codeMin={6} lock={null} passkeys={[]} />)
    expect(screen.getByRole('button', { name: 'Activer le verrouillage' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Désactiver le verrouillage' })).not.toBeInTheDocument()
    expect(screen.getByText('Verrouillage désactivé.')).toBeInTheDocument()
  })
})

describe('LockForms : sans JavaScript', () => {
  it('l’état d’un changement de code revenu du POST natif est rendu sans envoi', () => {
    postback.action = saveLockCode
    postback.state = { code: 'mismatch', at: 1 }
    expect(renderToString(<LockForms {...props} />)).toContain('Les deux saisies du code ne correspondent pas.')
  })

  it('l’état d’un retrait d’empreinte revenu du POST natif est rendu sans envoi', () => {
    postback.action = removePasskey
    postback.state = { code: 'revoked', at: 1 }
    expect(renderToString(<LockForms {...props} />)).toContain('Empreinte retirée.')
  })
})
