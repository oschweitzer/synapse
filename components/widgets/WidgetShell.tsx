import type { ReactNode } from 'react'
import { Panel } from '@/components/ui/Panel'
import type { IconName } from '@/components/ui/Icon'

/** Placement du widget sur la grille 12 colonnes : 8 (héros, tables) ou 4 (listes, mini-stats). */
export type PanelLayout = { index?: number; icon?: IconName; span?: 4 | 8; hero?: boolean }

function layoutProps({ index, icon, span = 4, hero }: PanelLayout, error?: boolean) {
  const variant = error ? 'alert' : hero ? 'hero' : 'default'
  return { index, icon, variant: variant as 'default' | 'hero' | 'alert', style: { gridColumn: `span ${span}` } }
}

function formatSync(syncedAt: Date | null) {
  if (!syncedAt) return null
  return `Synchro ${syncedAt.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}`
}

export function WidgetShell({
  title,
  syncedAt,
  error,
  children,
  ...layout
}: {
  title: string
  syncedAt?: Date | null
  error?: string
  children?: ReactNode
} & PanelLayout) {
  const sync = formatSync(syncedAt ?? null)

  return (
    <Panel title={title} meta={sync} {...layoutProps(layout, !!error)}>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : (
        children
      )}
    </Panel>
  )
}

export function WidgetSkeleton({ title, ...layout }: { title: string } & PanelLayout) {
  return (
    <Panel title={title} busy {...layoutProps(layout)}>
      <span className="sr-only">Chargement…</span>
      <div className="flex flex-col gap-3">
        <div className="h-4 w-2/3 animate-pulse bg-hull-600" />
        <div className="h-4 w-1/2 animate-pulse bg-hull-600" />
      </div>
    </Panel>
  )
}
