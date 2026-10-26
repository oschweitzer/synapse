import type { ReactNode } from 'react'
import type { Connector } from '@/lib/connectors/types'
import type { WidgetId } from '@/lib/dashboard'
import { WidgetShell, type PanelLayout } from './WidgetShell'

/** Lit un connecteur et rend l'état commun : données, erreur, dernière synchro. */
export async function WidgetSlot<T>({
  title,
  connector,
  userId,
  refreshId,
  render,
  ...layout
}: {
  title: string
  connector: Connector<T>
  userId: string
  refreshId?: WidgetId
  render: (data: T) => ReactNode
} & PanelLayout) {
  try {
    const { data, syncedAt, error } = await connector.read(userId)
    if (error) return <WidgetShell title={title} syncedAt={syncedAt} error={error} refreshId={refreshId} {...layout} />
    return (
      <WidgetShell title={title} syncedAt={syncedAt} refreshId={refreshId} {...layout}>
        {render(data)}
      </WidgetShell>
    )
  } catch (e) {
    console.error(`[widget:${connector.id}]`, e)
    return <WidgetShell title={title} error="Source indisponible pour le moment." refreshId={refreshId} {...layout} />
  }
}
