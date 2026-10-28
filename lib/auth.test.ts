import { describe, it, expect, vi } from 'vitest'
import { isAllowedUser } from '@/lib/auth'

type TestUser = Parameters<typeof isAllowedUser>[0]

const confirmed = '2026-01-01T00:00:00Z'
const user = (email: string | undefined, email_confirmed_at: string | undefined = confirmed): TestUser => ({
  email,
  email_confirmed_at,
})
const unconfirmed = (email: string): TestUser => ({ email, email_confirmed_at: undefined })

describe('isAllowedUser', () => {
  it('refuse tout le monde quand ALLOWED_EMAILS est absent', () => {
    vi.stubEnv('ALLOWED_EMAILS', undefined)
    expect(isAllowedUser(user('a@x.fr'))).toBe(false)
  })

  it('refuse tout le monde quand ALLOWED_EMAILS est vide', () => {
    vi.stubEnv('ALLOWED_EMAILS', '')
    expect(isAllowedUser(user('a@x.fr'))).toBe(false)
  })

  it('autorise une adresse listée et confirmée', () => {
    vi.stubEnv('ALLOWED_EMAILS', 'a@x.fr,b@x.fr')
    expect(isAllowedUser(user('b@x.fr'))).toBe(true)
  })

  it('ignore la casse et les espaces, des deux côtés', () => {
    vi.stubEnv('ALLOWED_EMAILS', ' A@x.fr , b@x.fr ')
    expect(isAllowedUser(user('a@X.fr'))).toBe(true)
    expect(isAllowedUser(user('B@x.FR'))).toBe(true)
  })

  it('refuse une adresse non confirmée, même listée', () => {
    vi.stubEnv('ALLOWED_EMAILS', 'a@x.fr')
    expect(isAllowedUser(unconfirmed('a@x.fr'))).toBe(false)
    expect(isAllowedUser({ email: 'a@x.fr', email_confirmed_at: null } as unknown as TestUser)).toBe(false)
  })

  it('refuse un utilisateur sans adresse', () => {
    vi.stubEnv('ALLOWED_EMAILS', 'a@x.fr')
    expect(isAllowedUser(user(undefined))).toBe(false)
    expect(isAllowedUser(user(''))).toBe(false)
  })

  it('refuse une adresse non listée', () => {
    vi.stubEnv('ALLOWED_EMAILS', 'a@x.fr')
    expect(isAllowedUser(user('c@x.fr'))).toBe(false)
  })

  it('les entrées vides de la liste ne correspondent pas à une adresse vide', () => {
    vi.stubEnv('ALLOWED_EMAILS', ',,')
    expect(isAllowedUser(user(''))).toBe(false)
    expect(isAllowedUser(user('a@x.fr'))).toBe(false)
  })
})
