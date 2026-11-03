/**
 * Synchro Google de Synapse : agenda (du mois précédent au mois suivant, couleurs Google comprises) et en-têtes des 20 derniers
 * mails, écrits dans le cache `synapse.*` que lit le dashboard.
 *
 * Deux appelants :
 *   - pg_cron, toutes les 30 min (migration 0002), avec l'en-tête
 *     `x-synapse-cron` = SYNAPSE_CRON_SECRET → tous les comptes connectés ;
 *   - le dashboard (« Synchroniser maintenant », retour d'OAuth), avec la
 *     session de l'utilisateur → son compte seulement.
 *
 * Déployée sans vérification JWT par la passerelle (`--no-verify-jwt`) : pg_cron
 * n'a pas de session, la fonction vérifie elle-même l'un ou l'autre.
 *
 * Chaque passage, par compte, laisse une ligne dans `synapse.sync_runs`.
 */

import { createClient } from 'npm:@supabase/supabase-js@2'
import { dechiffrer } from '../_shared/chiffrement.ts'
import {
  type CachedColors,
  colorKey,
  readEvents,
  readMails,
  ReauthError,
  refreshAccessToken,
} from '../_shared/google.ts'

function admin() {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: 'synapse' },
  })
}

type Db = ReturnType<typeof admin>

/** Comparaison à temps constant du secret pg_cron. */
function sameSecret(a: string, b: string) {
  const x = new TextEncoder().encode(a)
  const y = new TextEncoder().encode(b)
  if (x.length !== y.length) return false
  let diff = 0
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i]
  return diff === 0
}

async function markNeedsReauth(db: Db, userId: string) {
  const { error } = await db.from('google_accounts').update({ needs_reauth: true }).eq(
    'user_id',
    userId,
  )
  if (error) console.error('[synapse-google-sync] needs_reauth', userId, error.message)
}

/**
 * Couleurs des évènements déjà en cache, relues seulement quand Google ne donne pas
 * sa palette. Une lecture qui échoue ne bloque pas la synchro : on repart des
 * couleurs d'agenda.
 */
async function readCachedColors(db: Db, userId: string): Promise<CachedColors> {
  const colors: CachedColors = new Map()
  const size = 1000 // limite de lignes par requête côté PostgREST
  for (let from = 0;; from += size) {
    const { data, error } = await db
      .from('calendar_events')
      .select('calendar_id, event_id, background_color, foreground_color')
      .eq('user_id', userId)
      .order('calendar_id')
      .order('event_id')
      .range(from, from + size - 1)
    if (error) {
      console.error('[synapse-google-sync] couleurs en cache', userId, error.message)
      return new Map()
    }
    for (const row of data) {
      colors.set(colorKey(row.calendar_id, row.event_id), {
        background: row.background_color,
        foreground: row.foreground_color,
      })
    }
    if (data.length < size) return colors
  }
}

type Outcome = { user_id: string; status: 'success' | 'error'; error?: string }

async function syncUser(db: Db, userId: string): Promise<Outcome> {
  const { data: run, error: runError } = await db
    .from('sync_runs')
    .insert({ user_id: userId, source: 'google' })
    .select('id')
    .single()
  if (runError) console.error('[synapse-google-sync] sync_runs', userId, runError.message)

  const finish = async (status: 'success' | 'error', error?: string) => {
    if (run) {
      const { error: updateError } = await db
        .from('sync_runs')
        .update({ status, error: error ?? null, finished_at: new Date().toISOString() })
        .eq('id', run.id)
      if (updateError) console.error('[synapse-google-sync] sync_runs', userId, updateError.message)
    }
    return { user_id: userId, status, error }
  }

  try {
    const { data: credentials, error } = await db
      .from('google_credentials')
      .select('refresh_token_encrypted')
      .eq('user_id', userId)
      .maybeSingle()
    if (error) throw new Error(`lecture du jeton : ${error.message}`)

    // Illisible : la clé a changé depuis la connexion. Seule une reconnexion répare.
    const refreshToken = credentials && (await dechiffrer(credentials.refresh_token_encrypted))
    if (!refreshToken) throw new ReauthError('jeton absent ou illisible')

    const startedAt = Date.now()
    const accessToken = await refreshAccessToken(refreshToken)
    const [events, mails] = await Promise.all([
      readEvents(accessToken, new Date(), () => readCachedColors(db, userId)),
      readMails(accessToken),
    ])

    const { error: cacheError } = await db.rpc('replace_google_cache', {
      p_user_id: userId,
      p_events: events,
      p_mails: mails,
    })
    if (cacheError) throw new Error(`écriture du cache : ${cacheError.message}`)

    // Taille et durée du passage : de quoi juger, sur un vrai compte, si la fenêtre de
    // trois mois tient dans un seul envoi (voir MAX_PAGES dans _shared/google.ts).
    console.log(
      `[synapse-google-sync] ${userId} : ${events.length} évènements, ${mails.length} mails, ` +
        `${JSON.stringify(events).length} caractères d'évènements, ${Date.now() - startedAt} ms`,
    )

    return await finish('success')
  } catch (e) {
    if (e instanceof ReauthError) await markNeedsReauth(db, userId)
    const message = e instanceof Error ? e.message : String(e)
    console.error('[synapse-google-sync]', userId, message)
    return await finish(
      'error',
      e instanceof ReauthError ? `Reconnexion Google nécessaire : ${message}` : message,
    )
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return Response.json({ error: 'POST attendu' }, { status: 405 })

  const db = admin()
  let userIds: string[]

  const cronHeader = req.headers.get('x-synapse-cron')
  if (cronHeader !== null) {
    const secret = Deno.env.get('SYNAPSE_CRON_SECRET')
    if (!secret || !sameSecret(cronHeader, secret)) {
      return Response.json({ error: 'secret invalide' }, { status: 401 })
    }
    // Un compte à reconnecter n'est plus tenté : Google refuserait encore son jeton.
    const { data, error } = await db.from('google_accounts').select('user_id').eq(
      'needs_reauth',
      false,
    )
    if (error) return Response.json({ error: error.message }, { status: 500 })
    userIds = data.map((row) => row.user_id as string)
  } else {
    const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
    const { data, error } = token
      ? await db.auth.getUser(token)
      : { data: { user: null }, error: null }
    if (error || !data.user) return Response.json({ error: 'session absente' }, { status: 401 })

    const { data: account } = await db
      .from('google_accounts')
      .select('user_id')
      .eq('user_id', data.user.id)
      .maybeSingle()
    if (!account) return Response.json({ error: 'Google non connecté' }, { status: 404 })
    userIds = [data.user.id]
  }

  // Un compte après l'autre : quelques comptes au plus, et des quotas Google ménagés.
  const results: Outcome[] = []
  for (const userId of userIds) results.push(await syncUser(db, userId))

  const failed = results.some((r) => r.status === 'error')
  // Appel du dashboard : un échec remonte en erreur HTTP, pour l'afficher.
  return Response.json({ results }, { status: failed && cronHeader === null ? 502 : 200 })
})
