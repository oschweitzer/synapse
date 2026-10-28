import { describe, it, expect, vi, beforeEach } from 'vitest'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { mockServerClient } from '@/test/supabase-mock'
import { expectRedirect, throwRedirect } from '@/test/next-mock'
import { disconnectGoogle, syncGoogleNow } from './google'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(redirect).mockImplementation(throwRedirect)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

// Aucune de ces actions ne lit la session : la fonction SQL (auth.uid()) et l'Edge Function
// (JWT) la vérifient. Le cas « sans session » est donc simulé par l'erreur qu'elles renvoient.
describe('disconnectGoogle', () => {
  it('redirige vers ?google=error si la fonction échoue (dont sans session)', async () => {
    mockServerClient({ rpc: { disconnect_google: { error: { message: 'not authenticated' } } } })
    await expectRedirect(disconnectGoogle(), '/settings?google=error')
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('déconnecte puis revalide', async () => {
    const { rpc } = mockServerClient({ rpc: { disconnect_google: { data: null } } })
    await expectRedirect(disconnectGoogle(), '/settings?google=disconnected')
    expect(rpc).toHaveBeenCalledWith('disconnect_google')
    expect(revalidatePath).toHaveBeenCalledWith('/')
  })
})

describe('syncGoogleNow', () => {
  it('redirige vers ?google=sync-error si l’Edge Function échoue (dont sans session)', async () => {
    mockServerClient({ functions: { 'synapse-google-sync': { error: { message: 'unauthorized' } } } })
    await expectRedirect(syncGoogleNow(), '/settings?google=sync-error')
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('lance la synchro puis revalide', async () => {
    const { invoke } = mockServerClient({ functions: { 'synapse-google-sync': { data: {} } } })
    await expectRedirect(syncGoogleNow(), '/settings?google=synced')
    expect(invoke).toHaveBeenCalledWith('synapse-google-sync', { method: 'POST' })
    expect(revalidatePath).toHaveBeenCalledWith('/')
  })
})
