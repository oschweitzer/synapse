import { MarkerType, type Connection } from '@xyflow/react'
import { DEFAULT_EDGE_COLOR, EDGE_DASHES, EDGE_ROUTES, EDGE_WIDTHS, type ArrowMode, type DashMode, type EdgeRoute, type MindEdge } from './types'

export function edgeColor(edge: MindEdge) {
  return (edge.style?.stroke as string | undefined) ?? DEFAULT_EDGE_COLOR
}

export function marker(color: string) {
  return { type: MarkerType.ArrowClosed, color }
}

export type EdgeStyleValues = { route: EdgeRoute; arrow: ArrowMode; dash: DashMode; width: number; color: string }
export type EdgeDefaults = EdgeStyleValues

export const DEFAULT_EDGE_STYLE: EdgeDefaults = { route: 'default', arrow: 'end', dash: 'solid', width: 2, color: DEFAULT_EDGE_COLOR }

export function readEdgeStyle(edge: MindEdge): EdgeStyleValues {
  const dasharray = edge.style?.strokeDasharray
  const dash: DashMode = dasharray === '8 4' ? 'dashed' : dasharray === '2 4' ? 'dotted' : 'solid'
  const arrow: ArrowMode = edge.markerStart && edge.markerEnd ? 'both' : edge.markerEnd ? 'end' : edge.markerStart ? 'start' : 'none'
  return {
    route: EDGE_ROUTES.find((r) => r.value === edge.type)?.value ?? 'default',
    arrow,
    dash,
    width: Number(edge.style?.strokeWidth ?? 2),
    color: edgeColor(edge),
  }
}

export function withArrow(mode: ArrowMode, color: string): Pick<MindEdge, 'markerStart' | 'markerEnd'> {
  return {
    markerStart: mode === 'both' || mode === 'start' ? marker(color) : undefined,
    markerEnd: mode === 'both' || mode === 'end' ? marker(color) : undefined,
  }
}

/** Renvoie une copie du lien avec les seuls champs fournis modifiés (jamais de mutation). */
export function applyEdgeStyle(edge: MindEdge, values: Partial<EdgeStyleValues>): MindEdge {
  const next: MindEdge = { ...edge }
  if (values.route !== undefined) next.type = values.route
  if (values.color !== undefined || values.width !== undefined || values.dash !== undefined) {
    const style = { ...edge.style }
    if (values.color !== undefined) style.stroke = values.color
    if (values.width !== undefined) style.strokeWidth = values.width
    if (values.dash !== undefined) {
      const dasharray = EDGE_DASHES.find((d) => d.value === values.dash)?.dasharray
      if (dasharray === undefined) delete style.strokeDasharray
      else style.strokeDasharray = dasharray
    }
    next.style = style
  }
  if (values.arrow !== undefined) {
    Object.assign(next, withArrow(values.arrow, values.color ?? edgeColor(edge)))
  } else if (values.color !== undefined && values.color !== edgeColor(edge)) {
    Object.assign(next, withArrow(readEdgeStyle(edge).arrow, values.color))
  }
  return next
}

export function newEdge(connection: Connection, defaults: EdgeDefaults = DEFAULT_EDGE_STYLE): MindEdge {
  return applyEdgeStyle(
    {
      ...connection,
      id: `e-${crypto.randomUUID()}`,
      labelStyle: { fill: '#e4eef5' },
      labelBgStyle: { fill: '#0a111a' },
    },
    defaults,
  )
}

// Épaisseurs du sélecteur : si le lien porte une valeur hors liste (carte importée ou ancienne), elle est
// ajoutée pour que le sélecteur l'affiche au lieu de retomber sur la première option.
export function edgeWidthOptions(current: number): number[] {
  return EDGE_WIDTHS.includes(current) ? EDGE_WIDTHS : [...EDGE_WIDTHS, current].sort((a, b) => a - b)
}
