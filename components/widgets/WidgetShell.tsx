import type { ReactNode } from 'react'
import { Panel } from '@/components/ui/Panel'
import type { IconName } from '@/components/ui/Icon'
import { Spinner } from '@/components/ui/Spinner'
import type { WidgetId } from '@/lib/dashboard'
import { WidgetRefresh } from './WidgetRefresh'

/** Placement du widget sur la grille 12 colonnes : 8 (héros, tables) ou 4 (listes, mini-stats). */
export type PanelLayout = { index?: number | 'auto'; icon?: IconName; span?: 4 | 8; hero?: boolean }

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
  refreshId,
  children,
  ...layout
}: {
  title: string
  /** Widget rafraîchissable à la demande (bouton dans l'en-tête). */
  refreshId?: WidgetId
  syncedAt?: Date | null
  error?: string
  children?: ReactNode
} & PanelLayout) {
  const sync = formatSync(syncedAt ?? null)

  return (
    <Panel
      title={title}
      meta={
        (sync || refreshId) && (
          <>
            {sync}
            {refreshId && <WidgetRefresh id={refreshId} title={title} />}
          </>
        )
      }
      {...layoutProps(layout, !!error)}
    >
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
      <div className="flex items-center justify-center gap-3 py-4 text-cyan-400">
        <Spinner label="Chargement…" />
      </div>
    </Panel>
  )
}
