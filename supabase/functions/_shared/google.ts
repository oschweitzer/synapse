/**
 * Lecture Google pour la synchro : jeton, agenda, en-têtes Gmail.
 *
 * Tout ce qui touche au secret client vit ici, côté serveur. La synchro reste en
 * lecture seule : elle ne fait que lister et lire des en-têtes (`calendar.readonly`,
 * `gmail.modify` l'autorise, et les anciens jetons `gmail.readonly` continuent de
 * synchroniser). Le retrait du libellé UNREAD (« marquer comme lu ») est fait par
 * le serveur Next (`lib/google/gmail.ts`), pas ici.
 */

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
const CALENDAR_API = 'https://www.googleapis.com/calendar/v3'
const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me'

/** Les 20 derniers mails de la boîte de réception, jamais plus. */
export const MAIL_COUNT = 20

/**
 * Le client OAuth de Synapse, distinct de celui de Cairn (GOOGLE_CLIENT_ID_WEB…)
 * dont les secrets vivent dans le même projet Supabase.
 */
function credentials() {
  const id = Deno.env.get('SYNAPSE_GOOGLE_CLIENT_ID')
  const secret = Deno.env.get('SYNAPSE_GOOGLE_CLIENT_SECRET')
  if (!id || !secret) {
    throw new Error(
      'secrets SYNAPSE_GOOGLE_CLIENT_ID ou SYNAPSE_GOOGLE_CLIENT_SECRET absents des Edge Functions',
    )
  }
  return { id, secret }
}

/** Erreur définitive : le jeton ne vaut plus rien, il faut reconnecter Google. */
export class ReauthError extends Error {}

/**
 * Jeton d'accès frais depuis le refresh token. `invalid_grant` (révoqué, mot de
 * passe changé, expiré en mode Test) lève une ReauthError : réessayer n'y
 * changerait rien.
 */
export async function refreshAccessToken(refreshToken: string): Promise<string> {
  const { id, secret } = credentials()
  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: id,
      client_secret: secret,
      grant_type: 'refresh_token',
    }),
  })
  const body = await res.json()
  if (body.error === 'invalid_grant') throw new ReauthError('Google a refusé le refresh token')
  if (!res.ok) {
    throw new Error(`Google, jeton : ${body.error_description ?? body.error ?? res.status}`)
  }
  return body.access_token as string
}

async function getJson<T>(url: string, accessToken: string): Promise<T> {
  const res = await fetch(url, {
    headers: { authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(15_000),
  })
  if (res.status === 401 || res.status === 403) {
    // Scope retiré depuis le compte Google, ou API désactivée dans le projet Cloud.
    const body = await res.json().catch(() => ({}))
    const message = body.error?.message ?? res.statusText
    if (res.status === 401) throw new ReauthError(`Google ${res.status} : ${message}`)
    throw new Error(`Google ${res.status} : ${message}`)
  }
  if (!res.ok) throw new Error(`Google ${res.status} sur ${new URL(url).pathname}`)
  return res.json() as Promise<T>
}

// Agenda -------------------------------------------------------------------------

type GoogleCalendar = {
  id: string
  primary?: boolean
  selected?: boolean
  hidden?: boolean
  backgroundColor?: string
  foregroundColor?: string
}

type GoogleEvent = {
  id: string
  status?: string
  colorId?: string
  summary?: string
  location?: string
  htmlLink?: string
  start?: { date?: string; dateTime?: string }
  end?: { date?: string; dateTime?: string }
  attendees?: { self?: boolean; responseStatus?: string }[]
}

export type CachedEvent = {
  calendar_id: string
  event_id: string
  title: string | null
  location: string | null
  all_day: boolean
  start_at: string
  end_at: string
  html_link: string | null
  background_color: string | null
  foreground_color: string | null
}

/** Agendas affichés dans Google Agenda (cochés), dont le principal. */
async function listCalendars(accessToken: string) {
  const { items = [] } = await getJson<{ items?: GoogleCalendar[] }>(
    `${CALENDAR_API}/users/me/calendarList?minAccessRole=reader&maxResults=50`,
    accessToken,
  )
  return items.filter((c) => c.primary || (c.selected && !c.hidden))
}

/** Une date Google « toute la journée » (AAAA-MM-JJ) devient minuit UTC : à relire en UTC. */
function toInstant(value: { date?: string; dateTime?: string } | undefined) {
  if (value?.dateTime) return new Date(value.dateTime).toISOString()
  if (value?.date) return `${value.date}T00:00:00.000Z`
  return null
}

type EventPalette = Record<string, { background: string; foreground: string }>

/** Couleurs déjà en cache, par évènement (voir `colorKey`). */
export type CachedColors = Map<string, { background: string | null; foreground: string | null }>

export function colorKey(calendarId: string, eventId: string) {
  return `${calendarId}\u0000${eventId}`
}

/**
 * Palette des couleurs d'évènement, ou null si Google ne l'a pas donnée : la synchro
 * continue alors avec les couleurs déjà en cache (voir `toCachedEvent`).
 */
export async function readEventPalette(accessToken: string): Promise<EventPalette | null> {
  try {
    const { event = {} } = await getJson<{ event?: EventPalette }>(
      `${CALENDAR_API}/colors`,
      accessToken,
    )
    return event
  } catch (e) {
    if (e instanceof ReauthError) throw e
    console.error('[synapse-google-sync] palette', e instanceof Error ? e.message : String(e))
    return null
  }
}

export function toCachedEvent(
  calendar: GoogleCalendar,
  event: GoogleEvent,
  palette: EventPalette | null = {},
  cached?: CachedColors,
): CachedEvent | null {
  if (event.status === 'cancelled') return null
  // Une invitation déclinée n'occupe pas la journée.
  if (event.attendees?.some((a) => a.self && a.responseStatus === 'declined')) return null
  const start = toInstant(event.start)
  const end = toInstant(event.end) ?? start
  if (!start || !end) return null
  // La couleur de l'évènement l'emporte (en paire), sinon celle de l'agenda. Sans
  // palette, l'évènement coloré garde la couleur déjà en cache plutôt que de la perdre.
  const kept = !palette && event.colorId ? cached?.get(colorKey(calendar.id, event.id)) : undefined
  const own: { background: string; foreground: string | null } | undefined =
    (event.colorId ? palette?.[event.colorId] : undefined) ??
      (kept?.background ? { background: kept.background, foreground: kept.foreground } : undefined)
  return {
    calendar_id: calendar.id,
    event_id: event.id,
    title: event.summary ?? null,
    location: event.location ?? null,
    all_day: !event.start?.dateTime,
    start_at: start,
    end_at: end,
    html_link: event.htmlLink ?? null,
    background_color: own?.background ?? calendar.backgroundColor ?? null,
    foreground_color: own ? own.foreground : calendar.foregroundColor ?? null,
  }
}

/** Pages d'évènements lues au plus par agenda (250 évènements par page). */
const MAX_PAGES = 10

/**
 * Évènements du mois précédent au mois suivant de tous les agendas affichés,
 * avec leur couleur Google.
 */
export async function readEvents(
  accessToken: string,
  now = new Date(),
  loadCachedColors?: () => Promise<CachedColors>,
): Promise<CachedEvent[]> {
  // Bornes en UTC : du mois précédent au mois suivant, avec les marges d'une grille
  // lundi-dimanche de 6 semaines et 14 h de marge de fuseau. Le dashboard refiltre
  // sur ses propres jours.
  const hour = 3600 * 1000
  const day = 24 * hour
  const y = now.getUTCFullYear()
  const m = now.getUTCMonth()
  const timeMin = new Date(Date.UTC(y, m - 1, 1) - 7 * day - 14 * hour).toISOString()
  const timeMax = new Date(Date.UTC(y, m + 2, 1) + 14 * day + 14 * hour).toISOString()

  const [calendars, palette] = await Promise.all([
    listCalendars(accessToken),
    readEventPalette(accessToken),
  ])
  // Palette en échec : on relit les couleurs en cache pour ne pas les écraser.
  const cached = palette ? undefined : await loadCachedColors?.()
  const perCalendar = await Promise.all(
    calendars.map(async (calendar) => {
      let pageToken: string | undefined
      const events: CachedEvent[] = []
      for (let page = 0; page < MAX_PAGES; page++) {
        const params = new URLSearchParams({
          timeMin,
          timeMax,
          singleEvents: 'true',
          orderBy: 'startTime',
          maxResults: '250',
        })
        if (pageToken) params.set('pageToken', pageToken)
        const { items = [], nextPageToken } = await getJson<
          { items?: GoogleEvent[]; nextPageToken?: string }
        >(
          `${CALENDAR_API}/calendars/${encodeURIComponent(calendar.id)}/events?${params}`,
          accessToken,
        )
        for (const item of items) {
          const e = toCachedEvent(calendar, item, palette, cached)
          if (e) events.push(e)
        }
        pageToken = nextPageToken
        if (!pageToken) break
      }
      if (pageToken) {
        console.warn(`[synapse-google-sync] agenda tronqué à ${MAX_PAGES} pages : ${calendar.id}`)
      }
      return events
    }),
  )
  // Clé (agenda, évènement) en double : replace_google_cache en garderait une et
  // ignorerait l'autre sans rien dire (`on conflict do nothing`), on le dit ici.
  const seen = new Set<string>()
  const events = perCalendar.flat().filter((e) => {
    const key = colorKey(e.calendar_id, e.event_id)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  const dropped = perCalendar.reduce((n, list) => n + list.length, 0) - events.length
  if (dropped > 0) console.warn(`[synapse-google-sync] ${dropped} évènement(s) en double ignoré(s)`)
  return events
}

// Gmail --------------------------------------------------------------------------

type GmailMessage = {
  id: string
  threadId: string
  labelIds?: string[]
  snippet?: string
  internalDate?: string
  payload?: { headers?: { name: string; value: string }[] }
}

export type CachedMail = {
  message_id: string
  thread_id: string
  sender: string | null
  subject: string | null
  snippet: string | null
  received_at: string
  is_unread: boolean
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
}

/** L'extrait renvoyé par Gmail est échappé en HTML (« &#39; », « &amp; »…). */
export function decodeEntities(text: string) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === '#') {
      const n = code[1] === 'x' || code[1] === 'X'
        ? parseInt(code.slice(2), 16)
        : parseInt(code.slice(1), 10)
      return Number.isFinite(n) ? String.fromCodePoint(n) : match
    }
    return ENTITIES[code.toLowerCase()] ?? match
  })
}

export function toCachedMail(message: GmailMessage): CachedMail {
  const header = (name: string) =>
    message.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ??
      null
  return {
    message_id: message.id,
    thread_id: message.threadId,
    sender: header('From'),
    subject: header('Subject'),
    snippet: message.snippet ? decodeEntities(message.snippet) : null,
    received_at: new Date(Number(message.internalDate ?? 0)).toISOString(),
    is_unread: message.labelIds?.includes('UNREAD') ?? false,
  }
}

/**
 * En-têtes des 20 derniers mails de la boîte de réception. `format=metadata`
 * avec deux en-têtes seulement : le corps n'est jamais téléchargé.
 */
export async function readMails(accessToken: string): Promise<CachedMail[]> {
  const { messages = [] } = await getJson<{ messages?: { id: string }[] }>(
    `${GMAIL_API}/messages?labelIds=INBOX&maxResults=${MAIL_COUNT}`,
    accessToken,
  )
  return Promise.all(
    messages.slice(0, MAIL_COUNT).map(async ({ id }) =>
      toCachedMail(
        await getJson<GmailMessage>(
          `${GMAIL_API}/messages/${
            encodeURIComponent(id)
          }?format=metadata&metadataHeaders=From&metadataHeaders=Subject`,
          accessToken,
        ),
      )
    ),
  )
}
