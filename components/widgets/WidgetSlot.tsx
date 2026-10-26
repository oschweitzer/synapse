import type { ReactNode } from 'react'
import type { Connector } from '@/lib/connectors/types'
import { WidgetShell, type PanelLayout } from './WidgetShell'

/** Lit un connecteur et rend l'état commun : données, erreur, dernière synchro. */
export async function WidgetSlot<T>({
  title,
  connector,
  userId,
  render,
  ...layout
}: {
  title: string
  connector: Connector<T>
  userId: string
  render: (data: T) => ReactNode
} & PanelLayout) {
  try {
    const { data, syncedAt, error } = await connector.read(userId)
    if (error) return <WidgetShell title={title} syncedAt={syncedAt} error={error} {...layout} />
    return (
      <WidgetShell title={title} syncedAt={syncedAt} {...layout}>
        {render(data)}
      </WidgetShell>
    )
  } catch (e) {
    console.error(`[widget:${connector.id}]`, e)
    return <WidgetShell title={title} error="Source indisponible pour le moment." {...layout} />
  }
}
