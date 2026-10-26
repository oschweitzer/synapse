import type { Mail } from '@/lib/connectors/google'
import { TIME_ZONE } from '@/lib/time'
import { Badge } from '@/components/ui/Badge'
import { ConnectGoogle } from './GoogleBanner'

const muted = 'text-slate-500 dark:text-slate-400'

function formatReceived(iso: string, now = new Date()) {
  const date = new Date(iso)
  const sameDay =
    date.toLocaleDateString('fr-FR', { timeZone: TIME_ZONE }) === now.toLocaleDateString('fr-FR', { timeZone: TIME_ZONE })
  return sameDay
    ? date.toLocaleTimeString('fr-FR', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString('fr-FR', { timeZone: TIME_ZONE, day: 'numeric', month: 'short' })
}

export function MailWidget({ mail }: { mail: Mail }) {
  if (mail.status === 'disconnected') return <ConnectGoogle what="tes derniers mails" />
  if (mail.mails.length === 0) return <p className={`text-sm ${muted}`}>Boîte de réception vide.</p>

  const unread = mail.mails.filter((m) => m.isUnread).length

  return (
    <div className="flex flex-col gap-2">
      {unread > 0 && (
        <p>
          <Badge tone="amber">
            {unread} non lu{unread > 1 ? 's' : ''}
          </Badge>
        </p>
      )}
      <ul className="flex max-h-96 flex-col overflow-y-auto" aria-label="Derniers mails">
        {mail.mails.map((m) => (
          <li key={m.id}>
            <a
              href={m.href}
              target="_blank"
              rel="noopener noreferrer"
              className={`hud-mail ${m.isUnread ? 'hud-mail--unread' : ''}`}
            >
              <span className="hud-mail__pip" aria-hidden />
              <span className="hud-mail__from">
                {m.isUnread && <span className="hud-sr">Non lu : </span>}
                {m.sender}
              </span>
              <span className="hud-mail__time">{formatReceived(m.receivedAt)}</span>
              <span className="hud-mail__subject">
                {m.subject}
                {m.snippet && <span className="hud-mail__preview"> — {m.snippet}</span>}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}
