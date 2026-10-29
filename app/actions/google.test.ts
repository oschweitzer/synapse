import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { revalidatePath } from 'next/cache'
import { mockServerClient } from '@/test/supabase-mock'
import { disconnectGoogle, syncGoogleNow } from './google'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const NOW = new Date('2026-01-15T10:00:00Z')

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
})

// Aucune de ces actions ne lit la session : la fonction SQL (auth.uid()) et l'Edge Function
// (JWT) la vérifient. Le cas « sans session » est donc simulé par l'erreur qu'elles renvoient.
describe('disconnectGoogle', () => {
  it('renvoie « disconnect-error » si la fonction échoue (dont sans session), sans revalider', async () => {
    mockServerClient({ rpc: { disconnect_google: { error: { message: 'not authenticated' } } } })
    expect(await disconnectGoogle(null, new FormData())).toEqual({ code: 'disconnect-error', at: NOW.getTime() })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('déconnecte, revalide « / » et « /settings », renvoie « disconnected »', async () => {
    const { rpc } = mockServerClient({ rpc: { disconnect_google: { data: null } } })
    expect(await disconnectGoogle(null, new FormData())).toEqual({ code: 'disconnected', at: NOW.getTime() })
    expect(rpc).toHaveBeenCalledWith('disconnect_google')
    expect(revalidatePath).toHaveBeenCalledWith('/')
    expect(revalidatePath).toHaveBeenCalledWith('/settings')
  })
})

describe('syncGoogleNow', () => {
  it('renvoie « sync-error » si l’Edge Function échoue (dont sans session), sans revalider', async () => {
    mockServerClient({ functions: { 'synapse-google-sync': { error: { message: 'unauthorized' } } } })
    expect(await syncGoogleNow(null, new FormData())).toEqual({ code: 'sync-error', at: NOW.getTime() })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('lance la synchro, revalide « / » et « /settings », renvoie « synced »', async () => {
    const { invoke } = mockServerClient({ functions: { 'synapse-google-sync': { data: {} } } })
    expect(await syncGoogleNow(null, new FormData())).toEqual({ code: 'synced', at: NOW.getTime() })
    expect(invoke).toHaveBeenCalledWith('synapse-google-sync', { method: 'POST' })
    expect(revalidatePath).toHaveBeenCalledWith('/')
    expect(revalidatePath).toHaveBeenCalledWith('/settings')
  })
})
