import { describe, it, expect, vi, beforeEach } from 'vitest'
import { headers } from 'next/headers'
import { readRequestContext } from '@/lib/request-context'
import { signRequestContext } from '@/lib/request-context-headers'

vi.mock('next/headers', () => ({ headers: vi.fn() }))

beforeEach(() => vi.stubEnv('SYNAPSE_LOCK_SECRET', 'a'.repeat(32)))

const ID = '123e4567-e89b-12d3-a456-426614174000'

function withHeaders(init: Record<string, string>) {
  vi.mocked(headers).mockResolvedValue(new Headers(init) as unknown as Awaited<ReturnType<typeof headers>>)
}

describe('readRequestContext', () => {
  it('renvoie utilisateur et verrouillage quand les en-têtes sont valides', async () => {
    const lock = '{"config":{"idleMinutes":5,"epoch":2},"unlocked":false}'
    withHeaders({ 'x-synapse-user-id': ID, 'x-synapse-lock': lock, 'x-synapse-sig': await signRequestContext(ID, lock) })
    expect(await readRequestContext()).toEqual({ userId: ID, lock: { config: { idleMinutes: 5, epoch: 2 }, unlocked: false } })
  })

  it('renvoie null sans en-têtes', async () => {
    withHeaders({})
    expect(await readRequestContext()).toBeNull()
  })

  it("renvoie null si l'en-tête de verrouillage est mal formé", async () => {
    withHeaders({ 'x-synapse-user-id': ID, 'x-synapse-lock': 'oops', 'x-synapse-sig': await signRequestContext(ID, 'oops') })
    expect(await readRequestContext()).toBeNull()
  })

  it('renvoie null si la signature est absente (en-têtes forgés)', async () => {
    withHeaders({ 'x-synapse-user-id': ID, 'x-synapse-lock': '{"config":null,"unlocked":true}' })
    expect(await readRequestContext()).toBeNull()
  })
})
