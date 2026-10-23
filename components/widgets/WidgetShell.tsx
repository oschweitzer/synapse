import type { ReactNode } from 'react'

function formatSync(syncedAt: Date | null) {
  if (!syncedAt) return null
  return `Synchro ${syncedAt.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}`
}

export function WidgetShell({
  title,
  syncedAt,
  error,
  children,
}: {
  title: string
  syncedAt?: Date | null
  error?: string
  children?: ReactNode
}) {
  const sync = formatSync(syncedAt ?? null)

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h2>
      {error ? (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      ) : (
        children
      )}
      {sync && <p className="mt-auto text-xs text-slate-500">{sync}</p>}
    </section>
  )
}

export function WidgetSkeleton({ title }: { title: string }) {
  return (
    <section
      aria-busy="true"
      className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
    >
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h2>
      <div className="h-4 w-2/3 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
      <div className="h-4 w-1/2 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
    </section>
  )
}
