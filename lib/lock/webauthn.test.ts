import { describe, it, expect, vi } from 'vitest'
import { headers } from 'next/headers'
import { RP_NAME, fromBase64Url, relyingParty, toBase64Url } from '@/lib/lock/webauthn'

vi.mock('next/headers', () => ({ headers: vi.fn() }))

function withHeaders(init: Record<string, string>) {
  vi.mocked(headers).mockResolvedValue(new Headers(init) as unknown as Awaited<ReturnType<typeof headers>>)
}

describe('relyingParty', () => {
  it('en local, sans en-têtes forwarded : localhost en http', async () => {
    withHeaders({ host: 'localhost:3000' })
    expect(await relyingParty()).toEqual({ rpID: 'localhost', origin: 'http://localhost:3000' })
  })

  it('prend la première valeur de x-forwarded-host et x-forwarded-proto', async () => {
    withHeaders({
      host: 'interne:3000',
      'x-forwarded-host': 'synapse.example.com, proxy',
      'x-forwarded-proto': 'https,http',
    })
    expect(await relyingParty()).toEqual({ rpID: 'synapse.example.com', origin: 'https://synapse.example.com' })
  })

  it('un hôte public sans en-tête de protocole est en https', async () => {
    withHeaders({ host: 'synapse.example.com' })
    expect(await relyingParty()).toEqual({ rpID: 'synapse.example.com', origin: 'https://synapse.example.com' })
  })

  it('127.0.0.1 est en http', async () => {
    withHeaders({ host: '127.0.0.1:3000' })
    expect(await relyingParty()).toEqual({ rpID: '127.0.0.1', origin: 'http://127.0.0.1:3000' })
  })

  it('sans hôte, retombe sur localhost', async () => {
    withHeaders({})
    expect(await relyingParty()).toEqual({ rpID: 'localhost', origin: 'http://localhost' })
  })
})

describe('base64url', () => {
  it('fait l’aller-retour, sans remplissage et avec l’alphabet - et _', () => {
    const bytes = new Uint8Array([251, 255, 254, 0, 1, 2, 62, 63])
    const text = toBase64Url(bytes)
    expect(text).not.toMatch(/[+/=]/)
    expect(text).toMatch(/[-_]/)
    expect(Array.from(fromBase64Url(text))).toEqual(Array.from(bytes))
  })

  it('encode sans remplissage', () => {
    expect(toBase64Url(new Uint8Array([104, 105]))).toBe('aGk')
  })
})

describe('RP_NAME', () => {
  it('vaut Synapse', () => {
    expect(RP_NAME).toBe('Synapse')
  })
})
