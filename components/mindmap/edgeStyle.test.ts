import { MarkerType } from '@xyflow/react'
import { describe, expect, it } from 'vitest'
import { applyEdgeStyle, edgeWidthOptions, newEdge, readEdgeStyle } from './edgeStyle'
import { DEFAULT_EDGE_COLOR, EDGE_WIDTHS, type MindEdge } from './types'

const conn = { source: 'a', target: 'b', sourceHandle: null, targetHandle: null }
const bare: MindEdge = { id: 'e1', source: 'a', target: 'b' }
const m = (color: string) => ({ type: MarkerType.ArrowClosed, color })

describe('readEdgeStyle', () => {
  it('lit les valeurs par défaut d’un lien sans style', () => {
    expect(readEdgeStyle(bare)).toEqual({ route: 'default', arrow: 'none', dash: 'solid', width: 2, color: DEFAULT_EDGE_COLOR })
  })
  it('détecte tirets et pointillés', () => {
    expect(readEdgeStyle({ ...bare, type: 'step' }).route).toBe('default')
    expect(readEdgeStyle({ ...bare, type: 'straight' }).route).toBe('straight')
    expect(readEdgeStyle({ ...bare, style: { strokeDasharray: '8 4' } }).dash).toBe('dashed')
    expect(readEdgeStyle({ ...bare, style: { strokeDasharray: '2 4' } }).dash).toBe('dotted')
  })
  it('détecte les flèches', () => {
    expect(readEdgeStyle({ ...bare, markerStart: m('#fff'), markerEnd: m('#fff') }).arrow).toBe('both')
    expect(readEdgeStyle({ ...bare, markerStart: m('#fff') }).arrow).toBe('start')
    expect(readEdgeStyle({ ...bare, markerEnd: m('#fff') }).arrow).toBe('end')
  })
})

describe('applyEdgeStyle', () => {
  it('recolore le trait et les deux marqueurs sans muter le lien', () => {
    const edge: MindEdge = { ...bare, markerStart: m('#111'), markerEnd: m('#111'), style: { stroke: '#111', strokeWidth: 3 } }
    const snapshot = JSON.stringify(edge)
    const out = applyEdgeStyle(edge, { color: '#abc' })
    expect(out.style).toMatchObject({ stroke: '#abc', strokeWidth: 3 })
    expect(out.markerStart).toEqual(m('#abc'))
    expect(out.markerEnd).toEqual(m('#abc'))
    expect(JSON.stringify(edge)).toBe(snapshot)
  })
  it('arrow none efface les deux marqueurs', () => {
    const out = applyEdgeStyle({ ...bare, markerStart: m('#111'), markerEnd: m('#111') }, { arrow: 'none' })
    expect(out.markerStart).toBeUndefined()
    expect(out.markerEnd).toBeUndefined()
  })
  it('écrit tracé, épaisseur et trait', () => {
    const out = applyEdgeStyle(bare, { route: 'smoothstep', width: 5, dash: 'dotted' })
    expect(out.type).toBe('smoothstep')
    expect(out.style).toMatchObject({ strokeWidth: 5, strokeDasharray: '2 4' })
    expect(applyEdgeStyle(out, { dash: 'solid' }).style?.strokeDasharray).toBeUndefined()
    expect(applyEdgeStyle(out, { dash: 'solid' }).style).not.toHaveProperty('strokeDasharray')
  })
})

describe('newEdge', () => {
  it('produit le lien par défaut', () => {
    const e = newEdge(conn)
    expect(e.id.startsWith('e-')).toBe(true)
    expect(e.type).toBe('default')
    expect(e.markerEnd).toEqual(m(DEFAULT_EDGE_COLOR))
    expect(e.markerStart).toBeUndefined()
    expect(e.style).toMatchObject({ stroke: DEFAULT_EDGE_COLOR, strokeWidth: 2 })
    expect(e.labelStyle).toBeDefined()
    expect(e.labelBgStyle).toBeDefined()
  })
  it('applique des valeurs par défaut personnalisées', () => {
    const e = newEdge(conn, { route: 'straight', arrow: 'both', dash: 'dashed', width: 5, color: '#123456' })
    expect(e.type).toBe('straight')
    expect(e.style).toMatchObject({ stroke: '#123456', strokeWidth: 5, strokeDasharray: '8 4' })
    expect(e.markerStart).toEqual(m('#123456'))
    expect(e.markerEnd).toEqual(m('#123456'))
  })
})

describe('edgeWidthOptions', () => {
  it('renvoie les épaisseurs proposées quand la valeur y figure', () => {
    expect(edgeWidthOptions(2)).toEqual(EDGE_WIDTHS)
  })
  it('ajoute, triée, une épaisseur enregistrée hors de la liste', () => {
    expect(edgeWidthOptions(4)).toEqual([1, 2, 3, 4, 5])
    expect(edgeWidthOptions(8)).toEqual([1, 2, 3, 5, 8])
  })
})
