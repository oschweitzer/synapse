import type { Mail } from '@/lib/connectors/google'
import { TIME_ZONE } from '@/lib/time'
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
        <p className={`text-xs ${muted}`}>
          {unread} non lu{unread > 1 ? 's' : ''}
        </p>
      )}
      <ul className="flex max-h-96 flex-col divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800" aria-label="Derniers mails">
        {mail.mails.map((m) => (
          <li key={m.id}>
            <a
              href={m.href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col gap-0.5 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800/50"
            >
              <span className="flex items-baseline gap-2">
                {m.isUnread && (
                  <span className="h-2 w-2 shrink-0 self-center rounded-full bg-sky-600 dark:bg-sky-400">
                    <span className="sr-only">Non lu : </span>
                  </span>
                )}
                <span className={`min-w-0 flex-1 truncate ${m.isUnread ? 'font-semibold' : ''}`}>{m.sender}</span>
                <span className={`shrink-0 text-xs ${muted}`}>{formatReceived(m.receivedAt)}</span>
              </span>
              <span className={`truncate ${m.isUnread ? 'font-medium' : ''}`}>{m.subject}</span>
              {m.snippet && <span className={`truncate text-xs ${muted}`}>{m.snippet}</span>}
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}
