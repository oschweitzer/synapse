import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createClient } from '@/lib/supabase/server'
import { startOfDay } from '@/lib/time'
import {
  agendaConnector,
  gmailUrl,
  mailConnector,
  readGoogleAccount,
  senderName,
  toAgenda,
  type GoogleAccount,
} from '@/lib/connectors/google'
import { mockSupabase, type MockResult } from '@/test/supabase-mock'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))

type EventRow = Parameters<typeof toAgenda>[1][number]

// 15 janvier 2026, 11 h à Paris : aujourd'hui = [14 janv. 23:00Z, 15 janv. 23:00Z[.
const NOW = new Date('2026-01-15T10:00:00Z')
const FINISHED = '2026-01-15T09:30:00Z'

const ACCOUNT: GoogleAccount = { email: 'moi@x.fr', needsReauth: false, scopes: ['openid'] }
const ACCOUNT_ROW = { google_email: 'moi@x.fr', needs_reauth: false, scopes: ['openid'] }

let seq = 0
const event = (over: Partial<EventRow> = {}): EventRow => ({
  calendar_id: 'cal',
  event_id: `e${++seq}`,
  title: 'Réunion',
  location: null,
  all_day: false,
  start_at: '2026-01-15T14:00:00Z',
  end_at: '2026-01-15T15:00:00Z',
  html_link: null,
  ...over,
})

/** Évènement « toute la journée » : minuit UTC, fin exclusive. */
const allDay = (start: string, end: string, over: Partial<EventRow> = {}) =>
  event({ all_day: true, start_at: `${start}T00:00:00Z`, end_at: `${end}T00:00:00Z`, ...over })

function setup(tables: Record<string, MockResult | MockResult[]>) {
  const m = mockSupabase({ tables })
  vi.mocked(createClient).mockResolvedValue(m.client as never)
  return m
}

const SYNCED = { sync_runs: { data: { finished_at: FINISHED } } }

beforeEach(() => {
  seq = 0
  vi.mocked(createClient).mockReset()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('senderName', () => {
  it('rend le nom affiché, guillemets retirés', () => {
    expect(senderName('"Alice" <a@x.fr>')).toBe('Alice')
    expect(senderName('Bob Martin <b@x.fr>')).toBe('Bob Martin')
  })

  it('retombe sur l’adresse sans nom affiché', () => {
    expect(senderName('<a@x.fr>')).toBe('a@x.fr')
    expect(senderName('"" <a@x.fr>')).toBe('a@x.fr')
  })

  it('rend le texte rogné quand ce n’est pas « nom <adresse> »', () => {
    expect(senderName('  a@x.fr ')).toBe('a@x.fr')
  })

  it('rend « Expéditeur inconnu » sans expéditeur', () => {
    expect(senderName(null)).toBe('Expéditeur inconnu')
    expect(senderName('')).toBe('Expéditeur inconnu')
  })
})

describe('gmailUrl', () => {
  it('vise le compte connecté, adresse encodée', () => {
    expect(gmailUrl('t1', 'a+b@x.fr')).toBe('https://mail.google.com/mail/?authuser=a%2Bb%40x.fr#inbox/t1')
  })

  it('ouvre le premier compte sans adresse', () => {
    expect(gmailUrl('t1', null)).toBe('https://mail.google.com/mail/u/0/#inbox/t1')
  })

  it('encode l’id du fil', () => {
    expect(gmailUrl('a/b c', null)).toBe('https://mail.google.com/mail/u/0/#inbox/a%2Fb%20c')
  })
})

describe('toAgenda', () => {
  it('rend « ok » avec le compte et des listes vides sans évènement', () => {
    expect(toAgenda(ACCOUNT, [], NOW)).toEqual({ status: 'ok', account: ACCOUNT, today: [], upcoming: [], moreCount: 0 })
  })

  it('liste les évènements du jour dans l’ordre, ceux déjà finis marqués', () => {
    const agenda = toAgenda(
      ACCOUNT,
      [
        event({ event_id: 'later', start_at: '2026-01-15T14:00:00Z', end_at: '2026-01-15T15:00:00Z' }),
        event({ event_id: 'past', start_at: '2026-01-15T08:00:00Z', end_at: '2026-01-15T09:00:00Z' }),
        event({ event_id: 'ongoing', start_at: '2026-01-15T09:30:00Z', end_at: '2026-01-15T10:30:00Z' }),
        event({ event_id: 'ended-now', start_at: '2026-01-15T09:00:00Z', end_at: '2026-01-15T10:00:00Z' }),
      ],
      NOW,
    )
    if (agenda.status !== 'ok') throw new Error('attendu : ok')
    expect(agenda.today.map((e) => [e.id, e.isPast])).toEqual([
      ['cal/past', true],
      ['cal/ended-now', true],
      ['cal/ongoing', false],
      ['cal/later', false],
    ])
  })

  it('compte un évènement « toute la journée » (minuit UTC) sur le bon jour', () => {
    const agenda = toAgenda(
      ACCOUNT,
      [
        allDay('2026-01-15', '2026-01-16', { event_id: 'today' }),
        allDay('2026-01-16', '2026-01-17', { event_id: 'tomorrow' }),
        allDay('2026-01-14', '2026-01-15', { event_id: 'yesterday' }),
      ],
      NOW,
    )
    if (agenda.status !== 'ok') throw new Error('attendu : ok')
    expect(agenda.today.map((e) => e.id)).toEqual(['cal/today'])
    expect(agenda.upcoming.map((d) => [d.key, d.events.map((e) => e.id)])).toEqual([['2026-01-16', ['cal/tomorrow']]])
  })

  it('liste aujourd’hui un évènement sur plusieurs jours, sans le répéter plus tard', () => {
    const agenda = toAgenda(
      ACCOUNT,
      [
        allDay('2026-01-13', '2026-01-17', { event_id: 'trip' }),
        event({ event_id: 'night', start_at: '2026-01-14T20:00:00Z', end_at: '2026-01-16T08:00:00Z' }),
      ],
      NOW,
    )
    if (agenda.status !== 'ok') throw new Error('attendu : ok')
    expect(agenda.today.map((e) => e.id).sort()).toEqual(['cal/night', 'cal/trip'])
    expect(agenda.upcoming).toEqual([])
  })

  it('regroupe les jours suivants jusqu’à J+7, « toute la journée » en tête', () => {
    const agenda = toAgenda(
      ACCOUNT,
      [
        event({ event_id: 'd22', start_at: '2026-01-22T09:00:00Z', end_at: '2026-01-22T10:00:00Z' }),
        event({ event_id: 'd23', start_at: '2026-01-23T09:00:00Z', end_at: '2026-01-23T10:00:00Z' }),
        event({ event_id: 'd17', start_at: '2026-01-17T09:00:00Z', end_at: '2026-01-17T10:00:00Z' }),
        // 00:30 à Paris le 16 : plus tôt que le « toute la journée » du même jour (minuit UTC).
        event({ event_id: 'night', start_at: '2026-01-15T23:30:00Z', end_at: '2026-01-16T00:30:00Z' }),
        allDay('2026-01-16', '2026-01-17', { event_id: 'allday' }),
      ],
      NOW,
    )
    if (agenda.status !== 'ok') throw new Error('attendu : ok')
    expect(agenda.upcoming.map((d) => [d.key, d.date, d.events.map((e) => e.id)])).toEqual([
      ['2026-01-16', '2026-01-16T12:00:00Z', ['cal/allday', 'cal/night']],
      ['2026-01-17', '2026-01-17T12:00:00Z', ['cal/d17']],
      ['2026-01-22', '2026-01-22T12:00:00Z', ['cal/d22']],
    ])
    expect(agenda.moreCount).toBe(0)
  })

  it('ignore ce qui est passé ou au-delà de J+7', () => {
    const agenda = toAgenda(
      ACCOUNT,
      [
        event({ start_at: '2026-01-10T09:00:00Z', end_at: '2026-01-10T10:00:00Z' }),
        event({ start_at: '2026-01-23T09:00:00Z', end_at: '2026-01-23T10:00:00Z' }),
      ],
      NOW,
    )
    if (agenda.status !== 'ok') throw new Error('attendu : ok')
    expect(agenda.today).toEqual([])
    expect(agenda.upcoming).toEqual([])
    expect(agenda.moreCount).toBe(0)
  })

  it('affiche au plus 12 évènements à venir et compte le reste', () => {
    const rows = Array.from({ length: 15 }, (_, i) =>
      event({
        start_at: `2026-01-${16 + (i % 3)}T${String(8 + i).padStart(2, '0')}:00:00Z`,
        end_at: `2026-01-${16 + (i % 3)}T${String(9 + i).padStart(2, '0')}:00:00Z`,
      }),
    )
    const agenda = toAgenda(ACCOUNT, rows, NOW)
    if (agenda.status !== 'ok') throw new Error('attendu : ok')
    expect(agenda.upcoming.flatMap((d) => d.events)).toHaveLength(12)
    expect(agenda.moreCount).toBe(3)
  })

  it('met en forme un évènement : id, titre, lieu', () => {
    const agenda = toAgenda(
      ACCOUNT,
      [event({ calendar_id: 'c1', event_id: 'e9', title: '   ', location: '  Salle 3 ', html_link: 'https://cal.x/e9' }), event({ location: '  ' })],
      NOW,
    )
    if (agenda.status !== 'ok') throw new Error('attendu : ok')
    expect(agenda.today[0]).toMatchObject({ id: 'c1/e9', title: 'Sans titre', location: 'Salle 3', htmlLink: 'https://cal.x/e9', allDay: false })
    expect(agenda.today[1].location).toBeNull()
  })

  it('prend l’horloge du système par défaut', () => {
    const agenda = toAgenda(ACCOUNT, [event({ start_at: '2026-01-15T08:00:00Z', end_at: '2026-01-15T09:00:00Z' })])
    if (agenda.status !== 'ok') throw new Error('attendu : ok')
    expect(agenda.today[0].isPast).toBe(true)
  })
})

describe('readGoogleAccount', () => {
  it('rend null sans compte connecté', async () => {
    setup({ google_accounts: { data: null } })
    expect(await readGoogleAccount()).toBeNull()
  })

  it('traduit la ligne', async () => {
    setup({ google_accounts: { data: { google_email: 'a@x.fr', needs_reauth: true, scopes: ['openid', 'email'] } } })
    expect(await readGoogleAccount()).toEqual({ email: 'a@x.fr', needsReauth: true, scopes: ['openid', 'email'] })
  })

  it('lève l’erreur Supabase', async () => {
    const error = new Error('db down')
    setup({ google_accounts: { error } })
    await expect(readGoogleAccount()).rejects.toBe(error)
  })
})

describe('agendaConnector', () => {
  it('a l’id « google »', () => {
    expect(agendaConnector.id).toBe('google')
  })

  it('rend « disconnected » sans compte, sans lire évènements ni synchro', async () => {
    const m = setup({ google_accounts: { data: null } })
    expect(await agendaConnector.read('u1')).toEqual({ data: { status: 'disconnected' }, syncedAt: null })
    expect(m.calls.some((c) => c.table === 'calendar_events' || c.table === 'sync_runs')).toBe(false)
  })

  it('rend l’agenda et la date de la dernière synchro', async () => {
    setup({
      google_accounts: { data: ACCOUNT_ROW },
      calendar_events: { data: [event({ event_id: 'a', start_at: '2026-01-15T14:00:00Z' })] },
      ...SYNCED,
    })
    const result = await agendaConnector.read('u1')
    expect(result.syncedAt).toEqual(new Date(FINISHED))
    expect(result.data).toMatchObject({ status: 'ok', account: ACCOUNT, today: [{ id: 'cal/a' }], upcoming: [], moreCount: 0 })
  })

  it('borne la lecture : hier à J+9, avec un jour de marge pour les « toute la journée »', async () => {
    const m = setup({ google_accounts: { data: ACCOUNT_ROW }, calendar_events: { data: [] }, ...SYNCED })
    await agendaConnector.read('u1')
    const filters = m.calls.filter((c) => c.table === 'calendar_events')
    expect(filters).toContainEqual(expect.objectContaining({ method: 'gte', args: ['end_at', startOfDay(NOW, -1).toISOString()] }))
    expect(filters).toContainEqual(expect.objectContaining({ method: 'lt', args: ['start_at', startOfDay(NOW, 9).toISOString()] }))
  })

  it('rend un agenda vide sans évènement', async () => {
    setup({ google_accounts: { data: ACCOUNT_ROW }, calendar_events: { data: [] }, sync_runs: { data: null } })
    const result = await agendaConnector.read('u1')
    expect(result.data).toEqual({ status: 'ok', account: ACCOUNT, today: [], upcoming: [], moreCount: 0 })
    expect(result.syncedAt).toBeNull()
  })

  it('lève l’erreur de google_accounts', async () => {
    const error = new Error('accounts down')
    setup({ google_accounts: { error } })
    await expect(agendaConnector.read('u1')).rejects.toBe(error)
  })

  it('lève l’erreur de calendar_events', async () => {
    const error = new Error('events down')
    setup({ google_accounts: { data: ACCOUNT_ROW }, calendar_events: { error }, ...SYNCED })
    await expect(agendaConnector.read('u1')).rejects.toBe(error)
  })

  it('lève l’erreur de sync_runs', async () => {
    const error = new Error('runs down')
    setup({ google_accounts: { data: ACCOUNT_ROW }, calendar_events: { data: [] }, sync_runs: { error } })
    await expect(agendaConnector.read('u1')).rejects.toBe(error)
  })
})

describe('mailConnector', () => {
  const mail = (over: Record<string, unknown> = {}) => ({
    message_id: 'm1',
    thread_id: 't1',
    sender: '"Alice" <a@x.fr>',
    subject: 'Bonjour',
    snippet: 'Un aperçu',
    received_at: '2026-01-15T08:00:00Z',
    is_unread: true,
    ...over,
  })

  it('a l’id « google »', () => {
    expect(mailConnector.id).toBe('google')
  })

  it('rend « disconnected » sans compte, sans lire les mails', async () => {
    const m = setup({ google_accounts: { data: null } })
    expect(await mailConnector.read('u1')).toEqual({ data: { status: 'disconnected' }, syncedAt: null })
    expect(m.calls.some((c) => c.table === 'mail_headers' || c.table === 'sync_runs')).toBe(false)
  })

  it('rend les mails avec expéditeur lisible et lien Gmail', async () => {
    const m = setup({ google_accounts: { data: ACCOUNT_ROW }, mail_headers: { data: [mail()] }, ...SYNCED })
    const result = await mailConnector.read('u1')
    expect(result.syncedAt).toEqual(new Date(FINISHED))
    expect(result.data).toEqual({
      status: 'ok',
      account: ACCOUNT,
      mails: [
        {
          id: 'm1',
          sender: 'Alice',
          subject: 'Bonjour',
          snippet: 'Un aperçu',
          receivedAt: '2026-01-15T08:00:00Z',
          isUnread: true,
          href: gmailUrl('t1', 'moi@x.fr'),
        },
      ],
    })
    expect(m.calls).toContainEqual(expect.objectContaining({ table: 'mail_headers', method: 'limit', args: [20] }))
  })

  it('remplace un objet vide et masque un aperçu vide', async () => {
    setup({
      google_accounts: { data: ACCOUNT_ROW },
      mail_headers: { data: [mail({ subject: '  ', snippet: '  ', sender: null })] },
      ...SYNCED,
    })
    const result = await mailConnector.read('u1')
    if (result.data.status !== 'ok') throw new Error('attendu : ok')
    expect(result.data.mails[0]).toMatchObject({ subject: '(sans objet)', snippet: null, sender: 'Expéditeur inconnu' })
  })

  it('rend « ok » avec une liste vide sans mail', async () => {
    setup({ google_accounts: { data: ACCOUNT_ROW }, mail_headers: { data: [] }, ...SYNCED })
    expect((await mailConnector.read('u1')).data).toEqual({ status: 'ok', account: ACCOUNT, mails: [] })
  })

  it('lève l’erreur de google_accounts', async () => {
    const error = new Error('accounts down')
    setup({ google_accounts: { error } })
    await expect(mailConnector.read('u1')).rejects.toBe(error)
  })

  it('lève l’erreur de mail_headers', async () => {
    const error = new Error('mails down')
    setup({ google_accounts: { data: ACCOUNT_ROW }, mail_headers: { error }, ...SYNCED })
    await expect(mailConnector.read('u1')).rejects.toBe(error)
  })

  it('lève l’erreur de sync_runs', async () => {
    const error = new Error('runs down')
    setup({ google_accounts: { data: ACCOUNT_ROW }, mail_headers: { data: [] }, sync_runs: { error } })
    await expect(mailConnector.read('u1')).rejects.toBe(error)
  })
})
