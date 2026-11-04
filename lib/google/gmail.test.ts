import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GmailError, markMessageRead } from '@/lib/google/gmail'

const API = 'https://gmail.googleapis.com/gmail/v1/users/me'
const fetchMock = vi.fn()

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
  fetchMock.mockResolvedValue(json({ id: 'm1' }))
})

describe('markMessageRead', () => {
  it('POST messages/<id>/modify avec le jeton et removeLabelIds UNREAD', async () => {
    await markMessageRead('tok', 'm1')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`${API}/messages/m1/modify`)
    expect(init.method).toBe('POST')
    expect(init.headers).toMatchObject({ authorization: 'Bearer tok', 'content-type': 'application/json' })
    expect(JSON.parse(init.body)).toEqual({ removeLabelIds: ['UNREAD'] })
  })

  it('encode l’id du message dans l’adresse', async () => {
    await markMessageRead('tok', 'a/b c')
    expect(fetchMock.mock.calls[0][0]).toBe(`${API}/messages/a%2Fb%20c/modify`)
  })

  it('lève GmailError 403 avec le message de Google', async () => {
    fetchMock.mockResolvedValue(json({ error: { message: 'Insufficient Permission' } }, 403))
    const error = await markMessageRead('tok', 'm1').catch((e) => e)
    expect(error).toBeInstanceOf(GmailError)
    expect(error.status).toBe(403)
    expect(error.message).toBe('Gmail 403 : Insufficient Permission')
  })

  it('porte la raison de Google (errors[].reason ou details[].reason)', async () => {
    fetchMock.mockResolvedValue(json({ error: { message: 'x', errors: [{ reason: 'rateLimitExceeded' }] } }, 403))
    expect(await markMessageRead('tok', 'm1').catch((e) => e)).toMatchObject({ status: 403, reason: 'rateLimitExceeded' })
    fetchMock.mockResolvedValue(
      json({ error: { message: 'x', details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason: 'ACCESS_TOKEN_SCOPE_INSUFFICIENT' }] } }, 403),
    )
    expect(await markMessageRead('tok', 'm1').catch((e) => e)).toMatchObject({ reason: 'ACCESS_TOKEN_SCOPE_INSUFFICIENT' })
  })

  it('lève GmailError 404', async () => {
    fetchMock.mockResolvedValue(json({ error: { message: 'Not Found' } }, 404))
    await expect(markMessageRead('tok', 'm1')).rejects.toMatchObject({ status: 404 })
  })

  it('un corps d’erreur non JSON donne quand même une GmailError avec le statusText', async () => {
    fetchMock.mockResolvedValue(new Response('<html>', { status: 502, statusText: 'Bad Gateway' }))
    const error = await markMessageRead('tok', 'm1').catch((e) => e)
    expect(error).toBeInstanceOf(GmailError)
    expect(error.status).toBe(502)
    expect(error.message).toBe('Gmail 502 : Bad Gateway')
  })
})

describe('GOOGLE_GMAIL_API_URL (tests e2e uniquement)', () => {
  it('remplace l’adresse de base quand la variable est définie', async () => {
    vi.stubEnv('GOOGLE_GMAIL_API_URL', 'http://127.0.0.1:4010/gmail/v1/users/me')
    await markMessageRead('tok', 'm1')
    expect(fetchMock.mock.calls[0][0]).toBe('http://127.0.0.1:4010/gmail/v1/users/me/messages/m1/modify')
  })

  it('vide, retombe sur Google', async () => {
    vi.stubEnv('GOOGLE_GMAIL_API_URL', '')
    await markMessageRead('tok', 'm1')
    expect(fetchMock.mock.calls[0][0]).toBe(`${API}/messages/m1/modify`)
  })
})
