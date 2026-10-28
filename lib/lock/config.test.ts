import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { IDLE_CHOICES, readLockConfig } from '@/lib/lock/config'

function fakeSupabase(result: { data: unknown; error: unknown }) {
  const maybeSingle = vi.fn(async () => result)
  const select = vi.fn(() => ({ maybeSingle }))
  const from = vi.fn(() => ({ select }))
  const schema = vi.fn(() => ({ from }))
  return { client: { schema } as unknown as SupabaseClient, schema, from, select }
}

describe('readLockConfig', () => {
  it('renvoie idleMinutes et epoch de la ligne', async () => {
    const { client } = fakeSupabase({ data: { idle_minutes: 15, epoch: 4 }, error: null })
    expect(await readLockConfig(client)).toEqual({ idleMinutes: 15, epoch: 4 })
  })

  it("renvoie null quand le verrouillage n'est pas activé", async () => {
    const { client } = fakeSupabase({ data: null, error: null })
    expect(await readLockConfig(client)).toBeNull()
  })

  it("lève l'erreur Supabase quand la lecture échoue", async () => {
    const error = new Error('boom')
    const { client } = fakeSupabase({ data: null, error })
    await expect(readLockConfig(client)).rejects.toBe(error)
  })

  it('interroge synapse.lock avec les colonnes idle_minutes et epoch', async () => {
    const { client, schema, from, select } = fakeSupabase({ data: null, error: null })
    await readLockConfig(client)
    expect(schema).toHaveBeenCalledWith('synapse')
    expect(from).toHaveBeenCalledWith('lock')
    expect(select).toHaveBeenCalledWith('idle_minutes, epoch')
  })
})

describe('IDLE_CHOICES', () => {
  it('propose 1, 5, 15 minutes et la fermeture du navigateur (0)', () => {
    expect(IDLE_CHOICES.map((c) => c.minutes)).toEqual([1, 5, 15, 0])
  })
})
