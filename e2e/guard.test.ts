import { describe, it, expect } from 'vitest'
import { assertLocalTarget } from './guard'

const LOCAL = {
  NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:54321',
  DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
}

describe('assertLocalTarget', () => {
  it('accepte localhost pour Supabase et 127.0.0.1 pour la base', () => {
    expect(() => assertLocalTarget(LOCAL)).not.toThrow()
  })

  it('accepte 127.0.0.1 pour Supabase et localhost pour la base', () => {
    expect(() =>
      assertLocalTarget({
        NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
        DATABASE_URL: 'postgresql://postgres:postgres@localhost:54322/postgres',
      }),
    ).not.toThrow()
  })

  it('refuse une URL Supabase distante en nommant la variable', () => {
    expect(() => assertLocalTarget({ ...LOCAL, NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co' })).toThrow(
      /NEXT_PUBLIC_SUPABASE_URL.*abc\.supabase\.co/,
    )
  })

  it('refuse une base distante sans afficher le mot de passe', () => {
    const url = 'postgresql://postgres.ref:S3cr3tPw@aws-0-eu-west-3.pooler.supabase.com:5432/postgres'
    const error = (() => {
      try {
        assertLocalTarget({ ...LOCAL, DATABASE_URL: url })
      } catch (e) {
        return e as Error
      }
    })()
    expect(error).toBeInstanceOf(Error)
    expect(error!.message).toContain('DATABASE_URL')
    expect(error!.message).toContain('aws-0-eu-west-3.pooler.supabase.com')
    expect(error!.message).not.toContain('S3cr3tPw')
  })

  it('refuse une variable absente ou vide', () => {
    expect(() => assertLocalTarget({ DATABASE_URL: LOCAL.DATABASE_URL })).toThrow(/NEXT_PUBLIC_SUPABASE_URL/)
    expect(() => assertLocalTarget({ ...LOCAL, DATABASE_URL: '' })).toThrow(/DATABASE_URL/)
    expect(() => assertLocalTarget({})).toThrow()
  })

  it('refuse une valeur qui n’est pas une URL, sans la recopier', () => {
    const error = (() => {
      try {
        assertLocalTarget({ ...LOCAL, DATABASE_URL: 'pas-une-url-mot-de-passe' })
      } catch (e) {
        return e as Error
      }
    })()
    expect(error!.message).toContain('DATABASE_URL')
    expect(error!.message).not.toContain('mot-de-passe')
  })

  it('refuse les hôtes qui ressemblent à localhost', () => {
    for (const host of ['localhost.evil.com', '127.0.0.1.nip.io']) {
      expect(() => assertLocalTarget({ ...LOCAL, NEXT_PUBLIC_SUPABASE_URL: `http://${host}:54321` })).toThrow(host)
    }
  })
})
