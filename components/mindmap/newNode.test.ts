import { describe, expect, it } from 'vitest'
import { newNode, nodeSize } from './newNode'
import { DEFAULT_STYLE } from './types'

describe('nodeSize', () => {
  it('donne la taille de chaque forme', () => {
    expect(nodeSize('text')).toEqual({ width: 140, height: 60 })
    expect(nodeSize('diamond')).toEqual({ width: 160, height: 100 })
    expect(nodeSize('rect')).toEqual({ width: 160, height: 60 })
  })
})

describe('newNode', () => {
  it('centre le nœud sur le point donné', () => {
    const n = newNode('rect', { x: 500, y: 300 }, DEFAULT_STYLE)
    expect(n.position).toEqual({ x: 420, y: 270 })
    const d = newNode('diamond', { x: 500, y: 300 }, DEFAULT_STYLE)
    expect(d.position).toEqual({ x: 420, y: 250 })
  })

  it('applique la forme et le style, sélectionné, type mind', () => {
    const style = { ...DEFAULT_STYLE, fill: '#ff0000', fontSize: 24 }
    const n = newNode('ellipse', { x: 0, y: 0 }, style)
    expect(n.type).toBe('mind')
    expect(n.selected).toBe(true)
    expect(n.id.startsWith('n-')).toBe(true)
    expect(n.data).toMatchObject({ shape: 'ellipse', ...style })
  })

  it('un nœud texte porte le libellé « Texte », les autres un libellé vide', () => {
    expect(newNode('text', { x: 0, y: 0 }, DEFAULT_STYLE).data.label).toBe('Texte')
    expect(newNode('rounded', { x: 0, y: 0 }, DEFAULT_STYLE).data.label).toBe('')
  })
})
