import type { Mail } from '@/lib/connectors/google'
import { ConnectGoogle } from './GoogleBanner'
import { MailList } from './MailList'

const muted = 'text-slate-500 dark:text-slate-400'

export function MailWidget({ mail }: { mail: Mail }) {
  if (mail.status === 'disconnected') return <ConnectGoogle what="tes derniers mails" />
  if (mail.mails.length === 0) return <p className={`text-sm ${muted}`}>Boîte de réception vide.</p>

  return <MailList mails={mail.mails} canMarkRead={mail.canMarkRead} />
}
