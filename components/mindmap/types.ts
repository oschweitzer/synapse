import type { Edge, Node } from '@xyflow/react'

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

export type MindNode = Node<NodeData, 'mind'>
// Style d'un lien : champs natifs de React Flow (type, label, marqueurs, style).
export type MindEdge = Edge

export const SHAPES: Array<{ value: Shape; label: string }> = [
  { value: 'text', label: 'Texte' },
  { value: 'rect', label: 'Rectangle' },
  { value: 'rounded', label: 'Arrondi' },
  { value: 'ellipse', label: 'Ellipse' },
  { value: 'diamond', label: 'Losange' },
]

export const DEFAULT_STYLE = {
  fill: '#0f1924',
  stroke: '#3fd8f2',
  strokeWidth: 2,
  textColor: '#e4eef5',
  fontSize: 16,
}

export const DEFAULT_EDGE_COLOR = '#7fa8c0'
