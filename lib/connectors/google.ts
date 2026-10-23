import { createClient } from '@/lib/supabase/server'
import { dayKey, endOfToday, startOfDay } from '@/lib/time'
import type { Tables } from '@/lib/types/synapse'
import type { Connector } from './types'

/**
 * Agenda et mails Google, lus dans le cache `synapse.*` rempli par l'Edge
 * Function synapse-google-sync (pg_cron, toutes les 30 min). Le dashboard
 * n'appelle jamais Google lui-même.
 */

/** Jours affichés après aujourd'hui dans l'aperçu de l'agenda. */
const UPCOMING_DAYS = 7
/** Évènements affichés au plus dans l'aperçu des jours suivants. */
const UPCOMING_LIMIT = 12

type AccountRow = Pick<Tables<{ schema: 'synapse' }, 'google_accounts'>, 'google_email' | 'needs_reauth'>
type EventRow = Pick<
  Tables<{ schema: 'synapse' }, 'calendar_events'>,
  'calendar_id' | 'event_id' | 'title' | 'location' | 'all_day' | 'start_at' | 'end_at' | 'html_link'
>
type MailRow = Pick<
  Tables<{ schema: 'synapse' }, 'mail_headers'>,
  'message_id' | 'thread_id' | 'sender' | 'subject' | 'snippet' | 'received_at' | 'is_unread'
>

export type GoogleAccount = { email: string | null; needsReauth: boolean }

export type CalendarEvent = {
  id: string
  title: string
  location: string | null
  allDay: boolean
  startAt: string
  endAt: string
  htmlLink: string | null
  /** Déjà terminé (aujourd'hui uniquement). */
  isPast: boolean
}

export type AgendaDay = { key: string; date: string; events: CalendarEvent[] }

export type Agenda =
  | { status: 'disconnected' }
  | { status: 'ok'; account: GoogleAccount; today: CalendarEvent[]; upcoming: AgendaDay[]; moreCount: number }

export type MailHeader = {
  id: string
  sender: string
  subject: string
  snippet: string | null
  receivedAt: string
  isUnread: boolean
  href: string
}

export type Mail = { status: 'disconnected' } | { status: 'ok'; account: GoogleAccount; mails: MailHeader[] }

/** État de la connexion Google, ou `null` si aucun compte n'est connecté. */
export async function readGoogleAccount(): Promise<GoogleAccount | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .schema('synapse')
    .from('google_accounts')
    .select('google_email, needs_reauth')
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const row = data as AccountRow
  return { email: row.google_email, needsReauth: row.needs_reauth }
}

/** Fin de la dernière synchro Google réussie. */
async function readSyncedAt() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .schema('synapse')
    .from('sync_runs')
    .select('finished_at')
    .eq('source', 'google')
    .eq('status', 'success')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data?.finished_at ? new Date(data.finished_at as string) : null
}

/** Jour d'un évènement : les « toute la journée » sont stockés à minuit UTC. */
function eventDayKey(event: Pick<EventRow, 'all_day' | 'start_at'>) {
  return dayKey(new Date(event.start_at), event.all_day ? 'UTC' : undefined)
}

function toEvent(row: EventRow, now: Date): CalendarEvent {
  return {
    id: `${row.calendar_id}/${row.event_id}`,
    title: row.title?.trim() || 'Sans titre',
    location: row.location?.trim() || null,
    allDay: row.all_day,
    startAt: row.start_at,
    endAt: row.end_at,
    htmlLink: row.html_link,
    isPast: Date.parse(row.end_at) <= now.getTime(),
  }
}

export function toAgenda(account: GoogleAccount, rows: EventRow[], now = new Date()): Agenda {
  const todayKey = dayKey(now)
  const lastKey = dayKey(startOfDay(now, UPCOMING_DAYS))
  const startToday = startOfDay(now).getTime()
  const endToday = endOfToday(now).getTime()

  // Par jour, puis « toute la journée » en tête, puis par heure de début.
  const sorted = rows
    .map((row) => ({ row, key: eventDayKey(row) }))
    .sort(
      (a, b) =>
        a.key.localeCompare(b.key) ||
        Number(b.row.all_day) - Number(a.row.all_day) ||
        Date.parse(a.row.start_at) - Date.parse(b.row.start_at),
    )

  const today: CalendarEvent[] = []
  const later: { row: EventRow; key: string }[] = []
  for (const entry of sorted) {
    const { row, key } = entry
    // Aujourd'hui : tout ce qui chevauche la journée, y compris un évènement sur plusieurs jours.
    const overlapsToday = row.all_day
      ? key <= todayKey && dayKey(new Date(Date.parse(row.end_at) - 1), 'UTC') >= todayKey
      : Date.parse(row.start_at) < endToday && Date.parse(row.end_at) > startToday
    if (overlapsToday) today.push(toEvent(row, now))
    // Jours suivants (demain à J+7), regroupés par jour de début.
    else if (key > todayKey && key <= lastKey) later.push(entry)
  }

  const upcoming: AgendaDay[] = []
  for (const { row, key } of later.slice(0, UPCOMING_LIMIT)) {
    let day = upcoming.at(-1)
    if (day?.key !== key) {
      day = { key, date: `${key}T12:00:00Z`, events: [] }
      upcoming.push(day)
    }
    day.events.push(toEvent(row, now))
  }

  return { status: 'ok', account, today, upcoming, moreCount: Math.max(0, later.length - UPCOMING_LIMIT) }
}

/** Expéditeur lisible : le nom affiché, sinon l'adresse. */
export function senderName(from: string | null) {
  if (!from) return 'Expéditeur inconnu'
  const match = from.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/)
  return match ? match[1].trim() || match[2].trim() : from.trim()
}

/** Ouvre le fil dans Gmail, sur le bon compte si plusieurs sont connectés dans le navigateur. */
export function gmailUrl(threadId: string, email: string | null) {
  const base = email ? `https://mail.google.com/mail/?authuser=${encodeURIComponent(email)}` : 'https://mail.google.com/mail/u/0/'
  return `${base}#inbox/${encodeURIComponent(threadId)}`
}

export const agendaConnector: Connector<Agenda> = {
  id: 'google',
  async read() {
    const account = await readGoogleAccount()
    if (!account) return { data: { status: 'disconnected' }, syncedAt: null }

    const supabase = await createClient()
    const now = new Date()
    const [events, syncedAt] = await Promise.all([
      supabase
        .schema('synapse')
        .from('calendar_events')
        .select('calendar_id, event_id, title, location, all_day, start_at, end_at, html_link')
        // Un jour de marge : les « toute la journée » sont à minuit UTC.
        .gte('end_at', startOfDay(now, -1).toISOString())
        .lt('start_at', startOfDay(now, UPCOMING_DAYS + 2).toISOString())
        .order('start_at'),
      readSyncedAt(),
    ])
    if (events.error) throw events.error

    return { data: toAgenda(account, events.data as EventRow[], now), syncedAt }
  },
}

export const mailConnector: Connector<Mail> = {
  id: 'google',
  async read() {
    const account = await readGoogleAccount()
    if (!account) return { data: { status: 'disconnected' }, syncedAt: null }

    const supabase = await createClient()
    const [mails, syncedAt] = await Promise.all([
      supabase
        .schema('synapse')
        .from('mail_headers')
        .select('message_id, thread_id, sender, subject, snippet, received_at, is_unread')
        .order('received_at', { ascending: false })
        .limit(20),
      readSyncedAt(),
    ])
    if (mails.error) throw mails.error

    return {
      data: {
        status: 'ok',
        account,
        mails: (mails.data as MailRow[]).map((row) => ({
          id: row.message_id,
          sender: senderName(row.sender),
          subject: row.subject?.trim() || '(sans objet)',
          snippet: row.snippet?.trim() || null,
          receivedAt: row.received_at,
          isUnread: row.is_unread,
          href: gmailUrl(row.thread_id, account.email),
        })),
      },
      syncedAt,
    }
  },
}
