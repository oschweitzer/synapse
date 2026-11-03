'use client'

import { useState, type ReactNode } from 'react'
import type { AgendaMonth as AgendaMonthData } from '@/lib/connectors/google'
import { AgendaMonth } from './AgendaMonth'

type View = 'list' | 'month'

/**
 * Bascule entre la liste (rendue côté serveur par Agenda.tsx, passée en
 * `list`) et le calendrier du mois. Le mois est démonté au retour sur la liste :
 * il repart du jour courant à la prochaine bascule.
 */
export function AgendaView({ list, month }: { list: ReactNode; month: AgendaMonthData }) {
  const [view, setView] = useState<View>('list')

  return (
    <div className="flex flex-col gap-3">
      <div role="group" aria-label="Vue de l’agenda" className="flex gap-1">
        {(
          [
            ['list', 'Liste'],
            ['month', 'Mois'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={view === value}
            onClick={() => setView(value)}
            className={`hud-btn hud-btn--sm ${view === value ? 'hud-btn--primary' : 'hud-btn--ghost'}`}
          >
            {label}
          </button>
        ))}
      </div>
      {view === 'list' ? list : <AgendaMonth data={month} />}
    </div>
  )
}
