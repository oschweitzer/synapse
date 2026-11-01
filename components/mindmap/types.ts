import type { Edge, Node } from '@xyflow/react'
import type { IconName } from '@/components/ui/Icon'

export type Shape = 'text' | 'rect' | 'rounded' | 'ellipse' | 'diamond'

export type NodeData = {
  label: string
  shape: Shape
  fill: string
  stroke: string
  strokeWidth: number
  textColor: string
  fontSize: number
}

export type NodeStyleValues = Omit<NodeData, 'label' | 'shape'>

/** Outil actif de la boîte à outils : sélection, déplacement, ou une forme à placer. */
export type Tool = 'select' | 'pan' | Shape
export function isShapeTool(tool: Tool): tool is Shape {
  return tool !== 'select' && tool !== 'pan'
}

export type MindNode = Node<NodeData, 'mind'>
// Style d'un lien : champs natifs de React Flow (type, label, marqueurs, style).
export type MindEdge = Edge

export const SHAPES: Array<{ value: Shape; label: string; icon: IconName }> = [
  { value: 'text', label: 'Texte', icon: 'shape-text' },
  { value: 'rect', label: 'Rectangle', icon: 'shape-rect' },
  { value: 'rounded', label: 'Arrondi', icon: 'shape-rounded' },
  { value: 'ellipse', label: 'Ellipse', icon: 'shape-ellipse' },
  { value: 'diamond', label: 'Losange', icon: 'shape-diamond' },
]

export type EdgeRoute = 'default' | 'straight' | 'smoothstep'
export type ArrowMode = 'none' | 'end' | 'start' | 'both'
export type DashMode = 'solid' | 'dashed' | 'dotted'

export const EDGE_ROUTES: Array<{ value: EdgeRoute; label: string; icon: IconName }> = [
  { value: 'default', label: 'Courbe', icon: 'link-curve' },
  { value: 'straight', label: 'Droit', icon: 'link-straight' },
  { value: 'smoothstep', label: 'Angles', icon: 'link-step' },
]

export const EDGE_ARROWS: Array<{ value: ArrowMode; label: string; icon: IconName }> = [
  { value: 'none', label: 'Aucune', icon: 'arrow-none' },
  { value: 'end', label: 'Vers la fin', icon: 'arrow-end' },
  { value: 'start', label: 'Vers le début', icon: 'arrow-start' },
  { value: 'both', label: 'Les deux', icon: 'arrow-both' },
]

export const EDGE_DASHES: Array<{ value: DashMode; label: string; icon: IconName; dasharray: string | undefined }> = [
  { value: 'solid', label: 'Plein', icon: 'dash-solid', dasharray: undefined },
  { value: 'dashed', label: 'Tirets', icon: 'dash-dashed', dasharray: '8 4' },
  { value: 'dotted', label: 'Pointillés', icon: 'dash-dotted', dasharray: '2 4' },
]

export const FONT_SIZES = [12, 14, 16, 20, 24, 32]
export const NODE_WIDTHS = [1, 2, 3, 4, 6]
export const EDGE_WIDTHS = [1, 2, 3, 5]

export const DEFAULT_STYLE: NodeStyleValues = {
  fill: '#0f1924',
  stroke: '#3fd8f2',
  strokeWidth: 2,
  textColor: '#e4eef5',
  fontSize: 16,
}

export const DEFAULT_EDGE_COLOR = '#7fa8c0'
