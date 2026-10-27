'use client'

import { useState, useTransition, type ReactNode } from 'react'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { saveWidgetOrder } from '@/app/actions/dashboard'
import { Icon } from '@/components/ui/Icon'

export type DashboardItem = { id: string; title: string; span: 4 | 8; node: ReactNode }

function SortableItem({ item }: { item: DashboardItem }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  })

  return (
    <div
      ref={setNodeRef}
      className="hud-dash__item"
      data-dragging={isDragging || undefined}
      style={{ gridColumn: `span ${item.span}`, transform: CSS.Translate.toString(transform), transition }}
    >
      {item.node}
      <button
        type="button"
        ref={setActivatorNodeRef}
        className="hud-dash__handle"
        aria-label={`Déplacer « ${item.title} »`}
        {...attributes}
        {...listeners}
      >
        <Icon name="grid" size={14} />
      </button>
    </div>
  )
}

/** Grille de widgets réordonnable (souris, tactile, clavier) ; l'ordre est enregistré par dashboard. */
export function SortableDashboard({ dashboardId, items }: { dashboardId: string; items: DashboardItem[] }) {
  const [order, setOrder] = useState(() => items.map((i) => i.id))
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const byId = new Map(items.map((i) => [i.id, i]))
  // Un widget peut apparaître/disparaître entre deux rendus serveur : on ne garde que ceux fournis.
  const ordered = [...order.filter((id) => byId.has(id)), ...items.map((i) => i.id).filter((id) => !order.includes(id))]
  const title = (id: string | number) => byId.get(String(id))?.title ?? String(id)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const announcements: Announcements = {
    onDragStart: ({ active }) => `« ${title(active.id)} » saisi.`,
    onDragOver: ({ active, over }) =>
      over ? `« ${title(active.id)} » déplacé à la place de « ${title(over.id)} ».` : undefined,
    onDragEnd: ({ active, over }) =>
      over ? `« ${title(active.id)} » déposé à la place de « ${title(over.id)} ».` : `« ${title(active.id)} » reposé.`,
    onDragCancel: ({ active }) => `Déplacement de « ${title(active.id)} » annulé.`,
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return
    const previous = ordered
    const next = arrayMove(previous, previous.indexOf(String(active.id)), previous.indexOf(String(over.id)))
    setOrder(next)
    setError(null)
    startTransition(async () => {
      const result = await saveWidgetOrder(dashboardId, next).catch(() => ({ error: 'Impossible d’enregistrer l’ordre.' }))
      if (result.error) {
        setOrder(previous)
        setError(result.error)
      }
    })
  }

  return (
    <>
      {error && (
        <p role="alert" className="px-8 pt-2 text-sm text-danger max-[900px]:px-4">
          {error}
        </p>
      )}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
        accessibility={{
          announcements,
          screenReaderInstructions: {
            draggable:
              'Pour réordonner ce widget, appuie sur espace, déplace-le avec les flèches, puis espace pour le déposer ou échap pour annuler.',
          },
        }}
      >
        <SortableContext items={ordered} strategy={rectSortingStrategy}>
          <div className="hud-dash">
            {ordered.map((id) => (
              <SortableItem key={id} item={byId.get(id)!} />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </>
  )
}
