'use client'

import { useState, useTransition } from 'react'
import { markMailRead } from '@/app/actions/google'
import type { MailHeader } from '@/lib/connectors/google'
import { TIME_ZONE } from '@/lib/time'
import { Badge } from '@/components/ui/Badge'
import { Icon } from '@/components/ui/Icon'
import { Spinner } from '@/components/ui/Spinner'

const muted = 'text-slate-500 dark:text-slate-400'

function formatReceived(iso: string, now = new Date()) {
  const date = new Date(iso)
  const sameDay =
    date.toLocaleDateString('fr-FR', { timeZone: TIME_ZONE }) === now.toLocaleDateString('fr-FR', { timeZone: TIME_ZONE })
  return sameDay
    ? date.toLocaleTimeString('fr-FR', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString('fr-FR', { timeZone: TIME_ZONE, day: 'numeric', month: 'short' })
}

const Reconnect = () => (
  // Lien simple (pas next/link) : la route renvoie une redirection vers Google.
  <a href="/api/google/connect" className="underline">
    Reconnecter Google
  </a>
)

type Failure = { message: string; reconnect: boolean }

/**
 * Liste des derniers mails, avec « Marquer comme lu » sur les non lus. Le mail
 * passe en lu tout de suite ; si le serveur échoue, il redevient non lu et
 * l'erreur s'affiche sous la ligne. Le bouton est frère du lien, jamais dedans.
 */
export function MailList({ mails, canMarkRead }: { mails: MailHeader[]; canMarkRead: boolean }) {
  const [readIds, setReadIds] = useState<Set<string>>(() => new Set())
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set())
  const [seenMails, setSeenMails] = useState(mails)
  const [errors, setErrors] = useState<Record<string, Failure>>({})
  const [, startTransition] = useTransition()

  // Les props rechargées (revalidatePath) font foi : on repart du serveur, sauf
  // pour les mails dont l'enregistrement est encore en cours.
  if (mails !== seenMails) {
    setSeenMails(mails)
    setReadIds((ids) => new Set([...ids].filter((id) => pendingIds.has(id))))
  }

  const isUnread = (m: MailHeader) => m.isUnread && !readIds.has(m.id)
  const unread = mails.filter(isUnread).length

  function markRead(id: string) {
    setReadIds((ids) => new Set(ids).add(id))
    setPendingIds((ids) => new Set(ids).add(id))
    setErrors((all) => {
      const next = { ...all }
      delete next[id]
      return next
    })
    startTransition(async () => {
      const result = await markMailRead(id)
      setPendingIds((ids) => {
        const next = new Set(ids)
        next.delete(id)
        return next
      })
      if (result.error) {
        setReadIds((ids) => {
          const next = new Set(ids)
          next.delete(id)
          return next
        })
        setErrors((all) => ({ ...all, [id]: { message: result.error!, reconnect: !!result.reconnect } }))
      }
    })
  }

  return (
    <div className="flex flex-col gap-2">
      {unread > 0 && (
        <p>
          <Badge tone="amber">
            {unread} non lu{unread > 1 ? 's' : ''}
          </Badge>
        </p>
      )}
      {!canMarkRead && unread > 0 && (
        <p className={`text-xs ${muted}`}>
          Reconnecte Google pour marquer tes mails comme lus depuis Synapse. <Reconnect />
        </p>
      )}
      <ul className="flex max-h-96 flex-col overflow-y-auto" aria-label="Derniers mails">
        {mails.map((m) => {
          const unreadNow = isUnread(m)
          const error = errors[m.id]
          const pending = pendingIds.has(m.id)
          return (
            <li key={m.id}>
              <div className="hud-mail-row">
                <a
                  href={m.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`hud-mail ${unreadNow ? 'hud-mail--unread' : ''}`}
                >
                  <span className="hud-mail__pip" aria-hidden />
                  <span className="hud-mail__from">
                    {unreadNow && <span className="hud-sr">Non lu : </span>}
                    {m.sender}
                  </span>
                  <span className="hud-mail__time">{formatReceived(m.receivedAt)}</span>
                  <span className="hud-mail__subject">
                    {m.subject}
                    {m.snippet && <span className="hud-mail__preview"> — {m.snippet}</span>}
                  </span>
                </a>
                {(unreadNow || pending) && canMarkRead && (
                  <button
                    type="button"
                    className="hud-tool hud-mail__read"
                    aria-label={`Marquer comme lu : ${m.subject}`}
                    title="Marquer comme lu"
                    disabled={pending}
                    onClick={() => markRead(m.id)}
                  >
                    {pending ? <Spinner size="sm" label="Enregistrement…" /> : <Icon name="check" />}
                  </button>
                )}
              </div>
              {error && (
                <p role="alert" className="pb-1 text-xs text-red-600 dark:text-red-400">
                  {error.message} {error.reconnect && <Reconnect />}
                </p>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
