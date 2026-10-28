import { describe, it, expect, vi, beforeEach } from 'vitest'
import { isAdminUser } from '@/lib/admin'

type TestUser = Parameters<typeof isAdminUser>[0]

const user = (email: string): TestUser => ({ email, email_confirmed_at: '2026-01-01T00:00:00Z' })

describe('isAdminUser', () => {
  beforeEach(() => {
    vi.stubEnv('ALLOWED_EMAILS', 'a@x.fr,b@x.fr')
  })

  it("un compte non autorisé n'est jamais administrateur, même listé dans ADMIN_EMAILS", () => {
    vi.stubEnv('ADMIN_EMAILS', 'intrus@x.fr')
    expect(isAdminUser(user('intrus@x.fr'))).toBe(false)
  })

  it("un compte non confirmé n'est pas administrateur", () => {
    vi.stubEnv('ADMIN_EMAILS', '')
    expect(isAdminUser({ email: 'a@x.fr', email_confirmed_at: undefined })).toBe(false)
  })

  it('sans ADMIN_EMAILS, tout compte autorisé est administrateur', () => {
    vi.stubEnv('ADMIN_EMAILS', '')
    expect(isAdminUser(user('a@x.fr'))).toBe(true)
    expect(isAdminUser(user('b@x.fr'))).toBe(true)
  })

  it('ADMIN_EMAILS absent se comporte comme vide', () => {
    vi.stubEnv('ADMIN_EMAILS', undefined)
    expect(isAdminUser(user('a@x.fr'))).toBe(true)
  })

  it('avec ADMIN_EMAILS, seuls les comptes listés sont administrateurs (casse et espaces ignorés)', () => {
    vi.stubEnv('ADMIN_EMAILS', ' B@X.fr ')
    expect(isAdminUser(user('b@x.fr'))).toBe(true)
    expect(isAdminUser(user('B@x.fr'))).toBe(true)
  })

  it("un compte autorisé absent d'ADMIN_EMAILS n'est pas administrateur", () => {
    vi.stubEnv('ADMIN_EMAILS', 'b@x.fr')
    expect(isAdminUser(user('a@x.fr'))).toBe(false)
  })
})
