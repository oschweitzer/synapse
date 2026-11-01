// Création d'un nœud : fonctions pures, testables sans React Flow.
import type { XYPosition } from '@xyflow/react'
import type { MindNode, NodeStyleValues, Shape } from './types'

export function nodeSize(shape: Shape): { width: number; height: number } {
  return { width: shape === 'text' ? 140 : 160, height: shape === 'diamond' ? 100 : 60 }
}

/** Nœud centré sur `center` (coordonnées du canevas), sélectionné, avec le style donné. */
export function newNode(shape: Shape, center: XYPosition, style: NodeStyleValues): MindNode {
  const { width, height } = nodeSize(shape)
  return {
    id: `n-${crypto.randomUUID()}`,
    type: 'mind',
    position: { x: center.x - width / 2, y: center.y - height / 2 },
    width,
    height,
    selected: true,
    data: { label: shape === 'text' ? 'Texte' : '', shape, ...style },
  }
}
