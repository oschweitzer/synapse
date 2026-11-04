import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { mockServerClient } from '@/test/supabase-mock'
import { readGoogleAccount } from '@/lib/connectors/google'
import { decryptToken } from '@/lib/google/crypto'
import { GmailError, markMessageRead } from '@/lib/google/gmail'
import { GoogleReauthError, SCOPE_GMAIL, refreshAccessToken } from '@/lib/google/oauth'
import { testUser } from '@/test/supabase-mock'
import { disconnectGoogle, markMailRead, syncGoogleNow } from './google'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/connectors/google', () => ({ readGoogleAccount: vi.fn() }))
vi.mock('@/lib/google/crypto', () => ({ decryptToken: vi.fn() }))
vi.mock('@/lib/google/gmail', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/google/gmail')>()),
  markMessageRead: vi.fn(),
}))
vi.mock('@/lib/google/oauth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/google/oauth')>()),
  refreshAccessToken: vi.fn(),
}))

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

describe('markMailRead', () => {
  const REAUTH = 'Google a refusé l’accès de Synapse : reconnecte Google.'
  const SCOPE_MSG = 'Reconnecte Google pour autoriser Synapse à marquer tes mails comme lus.'
  const account = { email: 'moi@x.fr', needsReauth: false, scopes: ['openid', SCOPE_GMAIL] }

  function setup(opts: { account?: typeof account | null; row?: object | null; user?: ReturnType<typeof testUser> | null } = {}) {
    vi.mocked(readGoogleAccount).mockResolvedValue(opts.account === undefined ? account : opts.account)
    return mockServerClient({
      user: opts.user === undefined ? testUser() : opts.user,
      tables: { mail_headers: { data: opts.row === undefined ? { message_id: 'm1', is_unread: true } : opts.row } },
      rpc: {
        google_refresh_token: { data: 'cipher' },
        flag_google_reauth: { data: null },
        mark_mail_read: { data: true },
      },
    })
  }

  beforeEach(() => {
    vi.mocked(decryptToken).mockResolvedValue('refresh')
    vi.mocked(refreshAccessToken).mockResolvedValue('access')
    vi.mocked(markMessageRead).mockResolvedValue(undefined)
  })

  it('refuse un id invalide sans appeler Supabase', async () => {
    const { rpc } = setup()
    expect(await markMailRead('../x y')).toEqual({ error: 'Mail inconnu.' })
    expect(await markMailRead('')).toEqual({ error: 'Mail inconnu.' })
    expect(createClient).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
  })

  it('sans session : erreur de session, ni Gmail ni RPC', async () => {
    const { rpc } = setup({ user: null })
    expect(await markMailRead('m1')).toEqual({ error: 'Session expirée, reconnecte-toi.' })
    expect(markMessageRead).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
  })

  it('sans compte Google : reconnect', async () => {
    setup({ account: null })
    expect(await markMailRead('m1')).toMatchObject({ reconnect: true })
    expect(markMessageRead).not.toHaveBeenCalled()
  })

  it('compte à reconnecter : message de refus, reconnect', async () => {
    setup({ account: { ...account, needsReauth: true } })
    expect(await markMailRead('m1')).toEqual({ error: REAUTH, reconnect: true })
    expect(markMessageRead).not.toHaveBeenCalled()
  })

  it('compte sans SCOPE_GMAIL (ancien gmail.readonly) : message de scope, jamais d’appel Gmail', async () => {
    setup({ account: { ...account, scopes: ['openid'] } })
    expect(await markMailRead('m1')).toEqual({ error: SCOPE_MSG, reconnect: true })
    expect(markMessageRead).not.toHaveBeenCalled()
  })

  it('mail absent des en-têtes de l’utilisateur : « Mail introuvable. » sans appel Gmail', async () => {
    setup({ row: null })
    expect(await markMailRead('m1')).toEqual({ error: 'Mail introuvable.' })
    expect(markMessageRead).not.toHaveBeenCalled()
  })

  it('erreur de lecture des en-têtes : erreur générique, sans appel Gmail', async () => {
    vi.mocked(readGoogleAccount).mockResolvedValue(account)
    mockServerClient({ user: testUser(), tables: { mail_headers: { error: { message: 'boom' } } } })
    const result = await markMailRead('m1')
    expect(result.error).toBeTruthy()
    expect(markMessageRead).not.toHaveBeenCalled()
  })

  it('cache déjà « lu » : Gmail est quand même appelé (cache périmé)', async () => {
    setup({ row: { message_id: 'm1', is_unread: false } })
    expect(await markMailRead('m1')).toEqual({})
    expect(markMessageRead).toHaveBeenCalledWith('access', 'm1')
  })

  it('succès : Gmail avec le jeton frais, puis mark_mail_read, puis revalidation de « / »', async () => {
    const { rpc } = setup()
    expect(await markMailRead('m1')).toEqual({})
    expect(decryptToken).toHaveBeenCalledWith('cipher')
    expect(refreshAccessToken).toHaveBeenCalledWith('refresh')
    expect(markMessageRead).toHaveBeenCalledWith('access', 'm1')
    expect(rpc).toHaveBeenCalledWith('mark_mail_read', { p_message_id: 'm1' })
    expect(revalidatePath).toHaveBeenCalledWith('/')
  })

  it('succès même si mark_mail_read échoue (journalisé seulement)', async () => {
    vi.mocked(readGoogleAccount).mockResolvedValue(account)
    mockServerClient({
      user: testUser(),
      tables: { mail_headers: { data: { message_id: 'm1', is_unread: true } } },
      rpc: { google_refresh_token: { data: 'cipher' }, mark_mail_read: { error: { message: 'boom' } } },
    })
    expect(await markMailRead('m1')).toEqual({})
    expect(console.error).toHaveBeenCalled()
    expect(revalidatePath).toHaveBeenCalledWith('/')
  })

  it('GoogleReauthError : flag_google_reauth et reconnect', async () => {
    const { rpc } = setup()
    vi.mocked(refreshAccessToken).mockRejectedValue(new GoogleReauthError('invalid_grant'))
    expect(await markMailRead('m1')).toEqual({ error: REAUTH, reconnect: true })
    expect(rpc).toHaveBeenCalledWith('flag_google_reauth')
    expect(markMessageRead).not.toHaveBeenCalled()
  })

  it('jeton illisible : flag_google_reauth', async () => {
    const { rpc } = setup()
    vi.mocked(decryptToken).mockResolvedValue(null as never)
    expect(await markMailRead('m1')).toEqual({ error: REAUTH, reconnect: true })
    expect(rpc).toHaveBeenCalledWith('flag_google_reauth')
  })

  it('Gmail 401 deux fois : flag_google_reauth après un seul nouvel essai', async () => {
    const { rpc } = setup()
    vi.mocked(markMessageRead).mockRejectedValue(new GmailError(401, 'x'))
    expect(await markMailRead('m1')).toEqual({ error: REAUTH, reconnect: true })
    expect(markMessageRead).toHaveBeenCalledTimes(2)
    expect(refreshAccessToken).toHaveBeenCalledTimes(2)
    expect(rpc).toHaveBeenCalledWith('flag_google_reauth')
  })

  it('Gmail 401 ponctuel : nouvel essai avec un jeton neuf, sans flag_google_reauth', async () => {
    const { rpc } = setup()
    vi.mocked(refreshAccessToken).mockResolvedValueOnce('old').mockResolvedValueOnce('new')
    vi.mocked(markMessageRead).mockRejectedValueOnce(new GmailError(401, 'x')).mockResolvedValueOnce(undefined)
    expect(await markMailRead('m1')).toEqual({})
    expect(markMessageRead).toHaveBeenNthCalledWith(1, 'old', 'm1')
    expect(markMessageRead).toHaveBeenNthCalledWith(2, 'new', 'm1')
    expect(rpc).not.toHaveBeenCalledWith('flag_google_reauth')
    expect(rpc).toHaveBeenCalledWith('mark_mail_read', { p_message_id: 'm1' })
  })

  it('Gmail 401 puis refus du renouvellement (GoogleReauthError) : flag_google_reauth', async () => {
    const { rpc } = setup()
    vi.mocked(markMessageRead).mockRejectedValue(new GmailError(401, 'x'))
    vi.mocked(refreshAccessToken).mockResolvedValueOnce('old').mockRejectedValueOnce(new GoogleReauthError('invalid_grant'))
    expect(await markMailRead('m1')).toEqual({ error: REAUTH, reconnect: true })
    expect(rpc).toHaveBeenCalledWith('flag_google_reauth')
  })

  it('Gmail 403 : message de scope, sans flag_google_reauth', async () => {
    const { rpc } = setup()
    vi.mocked(markMessageRead).mockRejectedValue(new GmailError(403, 'x', 'insufficientPermissions'))
    expect(await markMailRead('m1')).toEqual({ error: SCOPE_MSG, reconnect: true })
    expect(rpc).not.toHaveBeenCalledWith('flag_google_reauth')
  })

  it('Gmail 403 de scope (ACCESS_TOKEN_SCOPE_INSUFFICIENT) : message de scope', async () => {
    setup()
    vi.mocked(markMessageRead).mockRejectedValue(new GmailError(403, 'x', 'ACCESS_TOKEN_SCOPE_INSUFFICIENT'))
    expect(await markMailRead('m1')).toEqual({ error: SCOPE_MSG, reconnect: true })
  })

  it.each(['rateLimitExceeded', 'userRateLimitExceeded', 'dailyLimitExceeded', undefined])(
    'Gmail 403 (%s) : erreur générique, sans invite de reconnexion',
    async (reason) => {
      const { rpc } = setup()
      vi.mocked(markMessageRead).mockRejectedValue(new GmailError(403, 'x', reason))
      expect(await markMailRead('m1')).toEqual({ error: 'Gmail n’a pas pu marquer ce mail comme lu, réessaie.' })
      expect(rpc).not.toHaveBeenCalledWith('flag_google_reauth')
    },
  )

  it('Gmail 404 : « Ce mail n’existe plus dans Gmail. »', async () => {
    setup()
    vi.mocked(markMessageRead).mockRejectedValue(new GmailError(404, 'x'))
    expect(await markMailRead('m1')).toEqual({ error: 'Ce mail n’existe plus dans Gmail.' })
  })

  it('Gmail 500 : erreur générique, cache intact, sans revalidation', async () => {
    const { rpc } = setup()
    vi.mocked(markMessageRead).mockRejectedValue(new GmailError(500, 'x'))
    const result = await markMailRead('m1')
    expect(result).toEqual({ error: 'Gmail n’a pas pu marquer ce mail comme lu, réessaie.' })
    expect(rpc).not.toHaveBeenCalledWith('mark_mail_read', expect.anything())
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})
