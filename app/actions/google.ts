'use server'

import { revalidatePath } from 'next/cache'
import { readGoogleAccount } from '@/lib/connectors/google'
import { decryptToken } from '@/lib/google/crypto'
import { GmailError, markMessageRead } from '@/lib/google/gmail'
import { GoogleReauthError, refreshAccessToken, SCOPE_GMAIL } from '@/lib/google/oauth'
import { createClient } from '@/lib/supabase/server'
import { sectionState, type SectionState } from '@/lib/settings/section-state'

/**
 * Retire l'accès de Synapse : jeton chiffré, état de connexion et cache.
 * L'autorisation reste visible chez Google (myaccount.google.com/permissions)
 * tant qu'elle n'y est pas retirée ; sans jeton, Synapse ne peut plus rien lire.
 * Action de `useActionState` : renvoie le code du message à afficher dans la section.
 */
export async function disconnectGoogle(_prev: SectionState, _formData: FormData): Promise<SectionState> {
  const supabase = await createClient()
  const { error } = await supabase.schema('synapse').rpc('disconnect_google')
  if (error) {
    console.error('[google] déconnexion', error)
    return sectionState('disconnect-error')
  }
  revalidatePath('/')
  revalidatePath('/settings')
  return sectionState('disconnected')
}

/**
 * Lance une synchro immédiate pour l'utilisateur connecté (l'Edge Function vérifie la session).
 * Action de `useActionState` : renvoie le code du message à afficher dans la section.
 */
export async function syncGoogleNow(_prev: SectionState, _formData: FormData): Promise<SectionState> {
  const supabase = await createClient()
  const { error } = await supabase.functions.invoke('synapse-google-sync', { method: 'POST' })
  if (error) {
    console.error('[google] synchro manuelle', error)
    return sectionState('sync-error')
  }
  revalidatePath('/')
  revalidatePath('/settings')
  return sectionState('synced')
}

const REAUTH = 'Google a refusé l’accès de Synapse : reconnecte Google.'
const SCOPE_MSG = 'Reconnecte Google pour autoriser Synapse à marquer tes mails comme lus.'
const SCOPE_REASONS = new Set(['insufficientPermissions', 'ACCESS_TOKEN_SCOPE_INSUFFICIENT'])

/**
 * Marque un mail comme lu dans Gmail, puis dans le cache `synapse.mail_headers`.
 * Action simple (pas `useActionState`) : le widget affiche l'erreur sous la ligne.
 *
 * Portée : retire le libellé UNREAD d'un seul message (scope `gmail.modify`),
 * jamais autre chose. Propriété : l'id doit exister dans les en-têtes de
 * l'appelant (RLS), sinon Gmail n'est pas appelé. Le cache n'est qu'un contrôle
 * de propriété : Gmail est toujours appelé (retrait idempotent), même si la
 * ligne est déjà lue, pour rattraper un cache périmé. Cache : Gmail reste la source
 * de vérité ; `mark_mail_read()` met la ligne à jour pour que le widget n'attende
 * pas la prochaine synchro, et un échec à cette étape n'est que journalisé.
 */
export async function markMailRead(messageId: string): Promise<{ error?: string; reconnect?: boolean }> {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(messageId)) return { error: 'Mail inconnu.' }

  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (!data.user) return { error: 'Session expirée, reconnecte-toi.' }

  const account = await readGoogleAccount()
  if (!account) return { error: 'Connecte Google pour marquer ce mail comme lu.', reconnect: true }
  if (account.needsReauth) return { error: REAUTH, reconnect: true }
  if (!account.scopes.includes(SCOPE_GMAIL)) return { error: SCOPE_MSG, reconnect: true }

  const { data: row, error: rowError } = await supabase
    .schema('synapse')
    .from('mail_headers')
    .select('message_id')
    .eq('message_id', messageId)
    .maybeSingle()
  if (rowError) {
    console.error('[google] marquer comme lu', rowError)
    return { error: 'Impossible de lire ce mail, réessaie.' }
  }
  if (!row) return { error: 'Mail introuvable.' }

  const flagReauth = async () => {
    const { error } = await supabase.schema('synapse').rpc('flag_google_reauth')
    if (error) console.error('[google] needs_reauth', error)
    return { error: REAUTH, reconnect: true }
  }

  let refreshToken: string
  let token: string
  try {
    const { data: cipher, error } = await supabase.schema('synapse').rpc('google_refresh_token')
    if (error) throw error
    const plain = cipher ? await decryptToken(cipher as string) : null
    if (!plain) return await flagReauth()
    refreshToken = plain
    token = await refreshAccessToken(refreshToken)
  } catch (e) {
    if (e instanceof GoogleReauthError) return await flagReauth()
    console.error('[google] marquer comme lu', e)
    return { error: 'Gmail n’a pas pu marquer ce mail comme lu, réessaie.' }
  }

  try {
    try {
      await markMessageRead(token, messageId)
    } catch (e) {
      // 401 : un jeton tout juste rafraîchi peut échouer ponctuellement ; un seul
      // nouvel essai avec un jeton neuf avant de signaler la reconnexion.
      if (!(e instanceof GmailError && e.status === 401)) throw e
      await markMessageRead(await refreshAccessToken(refreshToken), messageId)
    }
  } catch (e) {
    if (e instanceof GoogleReauthError) return await flagReauth()
    if (e instanceof GmailError) {
      if (e.status === 401) return await flagReauth()
      // 403 de scope : le jeton lit encore, il manque seulement le scope, donc pas de bandeau de reconnexion.
      // Les 403 de quota (rateLimitExceeded…) retombent sur le message générique.
      if (e.status === 403 && e.reason && SCOPE_REASONS.has(e.reason)) return { error: SCOPE_MSG, reconnect: true }
      if (e.status === 404) return { error: 'Ce mail n’existe plus dans Gmail.' }
    }
    console.error('[google] marquer comme lu', e)
    return { error: 'Gmail n’a pas pu marquer ce mail comme lu, réessaie.' }
  }

  const { data: updated, error: cacheError } = await supabase
    .schema('synapse')
    .rpc('mark_mail_read', { p_message_id: messageId })
  if (cacheError || updated === false) console.error('[google] cache des mails', cacheError ?? 'ligne introuvable')

  revalidatePath('/')
  return {}
}
