'use client'

import '@xyflow/react/dist/style.css'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  ConnectionMode,
  Controls,
  getNodesBounds,
  getViewportForBounds,
  MarkerType,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  reconnectEdge,
  useReactFlow,
  type Connection,
  type EdgeChange,
  type NodeChange,
  type Viewport,
} from '@xyflow/react'
import { toPng } from 'html-to-image'
import { saveMindmap, type MindmapPatch } from '@/app/actions/mindmaps'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { MindHistoryContext } from './history'
import { MindNodeView } from './MindNodeView'
import {
  DEFAULT_EDGE_COLOR,
  DEFAULT_STYLE,
  SHAPES,
  type MindEdge,
  type MindNode,
  type NodeData,
  type Shape,
} from './types'

const nodeTypes = { mind: MindNodeView }
const HISTORY_MAX = 100
const SAVE_DELAY_MS = 800

type Snapshot = { nodes: MindNode[]; edges: MindEdge[] }
type Status = 'saved' | 'saving' | 'error'

/** Ne garde que ce qui doit survivre au rechargement (pas la sélection, les mesures…). */
function serialize(nodes: MindNode[], edges: MindEdge[], viewport: Viewport | undefined) {
  const patch = {
    nodes: nodes.map(({ id, type, position, width, height, data }) => ({ id, type, position, width, height, data })),
    edges: edges.map((e) => {
      const edge = { ...e }
      delete edge.selected
      return edge
    }),
    viewport: viewport ?? null,
  }
  return { patch, json: JSON.stringify(patch) }
}

function edgeColor(edge: MindEdge) {
  return (edge.style?.stroke as string | undefined) ?? DEFAULT_EDGE_COLOR
}

function marker(color: string) {
  return { type: MarkerType.ArrowClosed, color }
}

function newEdge(connection: Connection): MindEdge {
  return {
    ...connection,
    id: `e-${crypto.randomUUID()}`,
    type: 'default',
    markerEnd: marker(DEFAULT_EDGE_COLOR),
    style: { stroke: DEFAULT_EDGE_COLOR, strokeWidth: 2 },
    labelStyle: { fill: '#e4eef5' },
    labelBgStyle: { fill: '#0a111a' },
  }
}

export function MindmapEditor(props: {
  id: string
  initialTitle: string
  initialNodes: MindNode[]
  initialEdges: MindEdge[]
  initialViewport?: Viewport
}) {
  return (
    <ReactFlowProvider>
      <Editor {...props} />
    </ReactFlowProvider>
  )
}

function Editor({ id, initialTitle, initialNodes, initialEdges, initialViewport }: Parameters<typeof MindmapEditor>[0]) {
  const { screenToFlowPosition, getNodes } = useReactFlow<MindNode, MindEdge>()
  const [nodes, setNodes] = useState(initialNodes)
  const [edges, setEdges] = useState(initialEdges)
  const [title, setTitle] = useState(initialTitle)
  const [status, setStatus] = useState<Status>('saved')
  const [error, setError] = useState<string | null>(null)
  const wrapper = useRef<HTMLDivElement>(null)

  // Copies lisibles depuis les gestionnaires d'événements (historique, sauvegarde).
  const nodesRef = useRef(nodes)
  const edgesRef = useRef(edges)
  const viewportRef = useRef(initialViewport)
  useEffect(() => {
    nodesRef.current = nodes
    edgesRef.current = edges
  }, [nodes, edges])

  // --- Historique ------------------------------------------------------------
  const past = useRef<Snapshot[]>([])
  const future = useRef<Snapshot[]>([])
  const [depth, setDepth] = useState({ past: 0, future: 0 })
  const sync = () => setDepth({ past: past.current.length, future: future.current.length })

  const record = useCallback(() => {
    past.current.push({ nodes: nodesRef.current, edges: edgesRef.current })
    if (past.current.length > HISTORY_MAX) past.current.shift()
    future.current = []
    setDepth({ past: past.current.length, future: 0 })
  }, [])

  // Une série de changements d'un même réglage (curseur de couleur) = une seule étape.
  const coalesce = useRef({ key: '', at: 0 })
  const recordCoalesced = (key: string) => {
    const now = Date.now()
    if (coalesce.current.key !== key || now - coalesce.current.at > 1500) record()
    coalesce.current = { key, at: now }
  }

  const undo = useCallback(() => {
    const snap = past.current.pop()
    if (!snap) return
    future.current.push({ nodes: nodesRef.current, edges: edgesRef.current })
    setNodes(snap.nodes)
    setEdges(snap.edges)
    sync()
  }, [])
  const redo = useCallback(() => {
    const snap = future.current.pop()
    if (!snap) return
    past.current.push({ nodes: nodesRef.current, edges: edgesRef.current })
    setNodes(snap.nodes)
    setEdges(snap.edges)
    sync()
  }, [])

  // --- Sauvegarde automatique --------------------------------------------------
  const lastSaved = useRef<string | null>(null)
  const inflight = useRef(false)
  const queued = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const flush = useCallback(async () => {
    if (inflight.current) {
      queued.current = true
      return
    }
    inflight.current = true
    try {
      do {
        queued.current = false
        const { patch, json } = serialize(nodesRef.current, edgesRef.current, viewportRef.current)
        if (json === lastSaved.current) {
          setStatus('saved')
          break
        }
        setStatus('saving')
        const res = await saveMindmap(id, patch as unknown as MindmapPatch)
        if (res.error) {
          setError(res.error)
          setStatus('error')
          return
        }
        lastSaved.current = json
        setError(null)
        setStatus('saved')
      } while (queued.current)
    } finally {
      inflight.current = false
    }
  }, [id])

  const schedule = useCallback(() => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => void flush(), SAVE_DELAY_MS)
  }, [flush])

  useEffect(() => {
    // Premier rendu : l'état de référence est celui qui vient de la base.
    if (lastSaved.current === null) {
      lastSaved.current = serialize(nodes, edges, viewportRef.current).json
      return
    }
    if (serialize(nodes, edges, viewportRef.current).json !== lastSaved.current) {
      setStatus('saving')
      schedule()
    }
  }, [nodes, edges, schedule])

  useEffect(() => () => clearTimeout(timer.current), [])

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (status !== 'saved') e.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [status])

  const saveTitle = async () => {
    const name = title.trim()
    if (!name) return setTitle(initialTitle)
    const res = await saveMindmap(id, { title: name })
    if (res.error) {
      setError(res.error)
      setStatus('error')
    }
  }

  // --- Édition -------------------------------------------------------------------
  const onNodesChange = useCallback((changes: NodeChange<MindNode>[]) => setNodes((n) => applyNodeChanges(changes, n)), [])
  const onEdgesChange = useCallback((changes: EdgeChange<MindEdge>[]) => setEdges((e) => applyEdgeChanges(changes, e)), [])
  const onConnect = useCallback(
    (connection: Connection) => {
      record()
      setEdges((e) => addEdge(newEdge(connection), e))
    },
    [record],
  )
  const onReconnect = useCallback(
    (oldEdge: MindEdge, connection: Connection) => {
      record()
      setEdges((e) => reconnectEdge(oldEdge, connection, e))
    },
    [record],
  )

  const addNode = (shape: Shape) => {
    record()
    const rect = wrapper.current?.getBoundingClientRect()
    const center = screenToFlowPosition({
      x: (rect?.left ?? 0) + (rect?.width ?? 400) / 2,
      y: (rect?.top ?? 0) + (rect?.height ?? 300) / 2,
    })
    const jitter = (nodesRef.current.length % 6) * 24
    const node: MindNode = {
      id: `n-${crypto.randomUUID()}`,
      type: 'mind',
      position: { x: center.x - 70 + jitter, y: center.y - 30 + jitter },
      width: shape === 'text' ? 140 : 160,
      height: shape === 'diamond' ? 100 : 60,
      selected: true,
      data: { label: shape === 'text' ? 'Texte' : '', shape, ...DEFAULT_STYLE },
    }
    setNodes((n) => [...n.map((x) => ({ ...x, selected: false })), node])
    setEdges((e) => e.map((x) => ({ ...x, selected: false })))
  }

  const duplicate = () => {
    const picked = nodesRef.current.filter((n) => n.selected)
    if (!picked.length) return
    record()
    const ids = new Map(picked.map((n) => [n.id, `n-${crypto.randomUUID()}`]))
    const copies: MindNode[] = picked.map((n) => ({
      ...n,
      id: ids.get(n.id)!,
      position: { x: n.position.x + 30, y: n.position.y + 30 },
      selected: true,
      data: { ...n.data },
    }))
    const links: MindEdge[] = edgesRef.current
      .filter((e) => ids.has(e.source) && ids.has(e.target))
      .map((e) => ({ ...e, id: `e-${crypto.randomUUID()}`, source: ids.get(e.source)!, target: ids.get(e.target)!, selected: false }))
    setNodes((n) => [...n.map((x) => ({ ...x, selected: false })), ...copies])
    setEdges((e) => [...e, ...links])
  }

  const patchNodes = (key: string, patch: Partial<NodeData>) => {
    recordCoalesced(key)
    setNodes((all) => all.map((n) => (n.selected ? { ...n, data: { ...n.data, ...patch } } : n)))
  }
  const patchEdges = (key: string, fn: (edge: MindEdge) => MindEdge) => {
    recordCoalesced(key)
    setEdges((all) => all.map((e) => (e.selected ? fn(e) : e)))
  }

  const exportPng = async () => {
    const all = getNodes()
    const viewportEl = wrapper.current?.querySelector<HTMLElement>('.react-flow__viewport')
    if (!all.length || !viewportEl) return
    const width = 2048
    const height = 1536
    const bounds = getNodesBounds(all)
    const vp = getViewportForBounds(bounds, width, height, 0.1, 2, 0.1)
    try {
      const url = await toPng(viewportEl, {
        backgroundColor: '#05080d',
        width,
        height,
        style: { width: `${width}px`, height: `${height}px`, transform: `translate(${vp.x}px, ${vp.y}px) scale(${vp.zoom})` },
      })
      const a = document.createElement('a')
      a.download = `${title.trim().replace(/[^\p{L}\p{N}-]+/gu, '-') || 'mind-map'}.png`
      a.href = url
      a.click()
    } catch (e) {
      console.error('[mindmaps] export', e)
      setError('Export impossible.')
      setStatus('error')
    }
  }

  // Écouteur sur la fenêtre : après un clic sur le canevas, le focus n'est dans aucun élément de l'éditeur.
  const shortcuts = useRef<(e: KeyboardEvent) => void>(() => {})
  useEffect(() => {
    shortcuts.current = (e) => {
      if ((e.target as HTMLElement).closest('input, textarea, select')) return
      if (!(e.ctrlKey || e.metaKey)) return
      const key = e.key.toLowerCase()
      if (key === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
      } else if (key === 'y') {
        e.preventDefault()
        redo()
      } else if (key === 'd') {
        e.preventDefault()
        duplicate()
      }
    }
  })
  useEffect(() => {
    const listener = (e: KeyboardEvent) => shortcuts.current(e)
    window.addEventListener('keydown', listener)
    return () => window.removeEventListener('keydown', listener)
  }, [])

  const selectedNodes = nodes.filter((n) => n.selected)
  const selectedEdges = edges.filter((e) => e.selected)
  const history = useMemo(() => ({ record }), [record])

  return (
    <MindHistoryContext.Provider value={history}>
      <div className="flex h-dvh flex-col">
        <header className="flex flex-wrap items-center gap-2 border-b border-[var(--line-500)] px-3 py-2">
          <Link href="/mindmaps" className="text-sm underline">
            ← Cartes
          </Link>
          <input
            value={title}
            maxLength={120}
            aria-label="Titre de la carte"
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => void saveTitle()}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            className="hud-input hud-input--sm min-w-0 max-w-64 flex-1 font-semibold"
          />
          <span className="flex flex-wrap items-center gap-1" role="group" aria-label="Ajouter">
            {SHAPES.map((s) => (
              <Button key={s.value} size="sm" icon="plus" onClick={() => addNode(s.value)}>
                {s.label}
              </Button>
            ))}
          </span>
          <span className="flex items-center gap-1" role="group" aria-label="Historique">
            <Button size="sm" variant="quiet" onClick={undo} disabled={!depth.past} title="Annuler (Ctrl+Z)">
              Annuler
            </Button>
            <Button size="sm" variant="quiet" onClick={redo} disabled={!depth.future} title="Rétablir (Ctrl+Y)">
              Rétablir
            </Button>
          </span>
          <Button size="sm" variant="quiet" onClick={duplicate} disabled={!selectedNodes.length} title="Dupliquer (Ctrl+D)">
            Dupliquer
          </Button>
          <Button size="sm" variant="quiet" onClick={() => void exportPng()} disabled={!nodes.length}>
            Export PNG
          </Button>
          <span role="status" className="ml-auto text-xs text-slate-400">
            {status === 'saving' && 'Enregistrement…'}
            {status === 'saved' && 'Enregistré'}
            {status === 'error' && (
              <span className="text-red-400">
                {error ?? 'Erreur'}{' '}
                <button type="button" className="underline" onClick={() => void flush()}>
                  Réessayer
                </button>
              </span>
            )}
          </span>
        </header>

        {(selectedNodes.length > 0 || selectedEdges.length > 0) && (
          <div className="flex flex-wrap items-end gap-x-6 gap-y-2 border-b border-[var(--line-500)] px-3 py-2 text-xs">
            {selectedNodes.length > 0 && <NodeStyle nodes={selectedNodes} patch={patchNodes} />}
            {selectedEdges.length > 0 && <EdgeStyle edges={selectedEdges} patch={patchEdges} />}
            <Button
              size="sm"
              variant="danger-quiet"
              icon="trash"
              onClick={() => {
                // Même chemin que la touche Suppr : les liens des nœuds partent avec eux.
                record()
                const gone = new Set(selectedNodes.map((n) => n.id))
                setNodes((all) => all.filter((n) => !n.selected))
                setEdges((all) => all.filter((e) => !e.selected && !gone.has(e.source) && !gone.has(e.target)))
              }}
            >
              Supprimer
            </Button>
          </div>
        )}

        <div ref={wrapper} className="min-h-0 flex-1">
          <ReactFlow<MindNode, MindEdge>
            colorMode="dark"
            style={{ '--xy-background-color': '#05080d' } as React.CSSProperties}
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onReconnect={onReconnect}
            onNodeDragStart={record}
            onBeforeDelete={async (items) => {
              record()
              return items
            }}
            onMoveEnd={(_, vp) => {
              viewportRef.current = vp
              if (serialize(nodesRef.current, edgesRef.current, vp).json !== lastSaved.current) schedule()
            }}
            connectionMode={ConnectionMode.Loose}
            defaultViewport={initialViewport}
            fitView={!initialViewport && initialNodes.length > 0}
            deleteKeyCode={['Backspace', 'Delete']}
            minZoom={0.1}
            maxZoom={3}
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={24} color="#1e3042" />
            <Controls showInteractive={false} />
            <MiniMap pannable zoomable nodeColor={(n) => (n.data as NodeData).stroke} maskColor="rgba(5,8,13,.7)" style={{ background: '#0a111a' }} />
          </ReactFlow>
        </div>
      </div>
    </MindHistoryContext.Provider>
  )
}

const FONT_SIZES = [12, 14, 16, 20, 24, 32]
const NODE_WIDTHS = [1, 2, 3, 4, 6]
const EDGE_WIDTHS = [1, 2, 3, 5]

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-slate-400">
      {label}
      {children}
    </label>
  )
}

function Color({ label, value, onChange, clearable }: { label: string; value: string; onChange: (v: string) => void; clearable?: boolean }) {
  return (
    <Field label={label}>
      <span className="flex items-center gap-1">
        <input
          type="color"
          value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#000000'}
          onChange={(e) => onChange(e.target.value)}
          className="h-7 w-10 cursor-pointer border border-[var(--line-500)] bg-transparent p-0"
        />
        {clearable && (
          <button type="button" className="hud-btn hud-btn--quiet hud-btn--sm" onClick={() => onChange('transparent')} title="Sans remplissage">
            <Icon name="close" size={12} />
          </button>
        )}
      </span>
    </Field>
  )
}

function Select<T extends string | number>({ label, value, options, onChange }: { label: string; value: T; options: Array<[T, string]>; onChange: (v: T) => void }) {
  return (
    <Field label={label}>
      <select
        className="hud-input hud-input--sm"
        value={String(value)}
        onChange={(e) => onChange((typeof value === 'number' ? Number(e.target.value) : e.target.value) as T)}
      >
        {options.map(([v, text]) => (
          <option key={v} value={v}>
            {text}
          </option>
        ))}
      </select>
    </Field>
  )
}

function NodeStyle({ nodes, patch }: { nodes: MindNode[]; patch: (key: string, p: Partial<NodeData>) => void }) {
  const d = nodes[0].data
  return (
    <fieldset className="flex flex-wrap items-end gap-3">
      <legend className="sr-only">Style des nœuds</legend>
      <Select label="Forme" value={d.shape} options={SHAPES.map((s) => [s.value, s.label])} onChange={(shape) => patch('shape', { shape })} />
      <Color label="Remplissage" value={d.fill} clearable onChange={(fill) => patch('fill', { fill })} />
      <Color label="Bordure" value={d.stroke} onChange={(stroke) => patch('stroke', { stroke })} />
      <Select label="Épaisseur" value={d.strokeWidth} options={NODE_WIDTHS.map((w) => [w, `${w} px`])} onChange={(strokeWidth) => patch('strokeWidth', { strokeWidth })} />
      <Color label="Texte" value={d.textColor} onChange={(textColor) => patch('textColor', { textColor })} />
      <Select label="Taille" value={d.fontSize} options={FONT_SIZES.map((s) => [s, `${s} px`])} onChange={(fontSize) => patch('fontSize', { fontSize })} />
    </fieldset>
  )
}

function EdgeStyle({ edges, patch }: { edges: MindEdge[]; patch: (key: string, fn: (e: MindEdge) => MindEdge) => void }) {
  const e = edges[0]
  const color = edgeColor(e)
  const dash = e.style?.strokeDasharray === '8 4' ? 'dashed' : e.style?.strokeDasharray === '2 4' ? 'dotted' : 'solid'
  const arrow = e.markerStart && e.markerEnd ? 'both' : e.markerEnd ? 'end' : e.markerStart ? 'start' : 'none'
  const withArrow = (mode: string, c: string): Pick<MindEdge, 'markerStart' | 'markerEnd'> => ({
    markerStart: mode === 'both' || mode === 'start' ? marker(c) : undefined,
    markerEnd: mode === 'both' || mode === 'end' ? marker(c) : undefined,
  })
  return (
    <fieldset className="flex flex-wrap items-end gap-3">
      <legend className="sr-only">Style des liens</legend>
      <Field label="Texte du lien">
        <input
          className="hud-input hud-input--sm w-40"
          value={typeof e.label === 'string' ? e.label : ''}
          maxLength={80}
          onChange={(ev) => patch('label', (x) => ({ ...x, label: ev.target.value || undefined }))}
        />
      </Field>
      <Color
        label="Couleur du lien"
        value={color}
        onChange={(c) => patch('edge-color', (x) => ({ ...x, style: { ...x.style, stroke: c }, ...withArrow(arrow, c) }))}
      />
      <Select label="Épaisseur du lien" value={Number(e.style?.strokeWidth ?? 2)} options={EDGE_WIDTHS.map((w) => [w, `${w} px`])} onChange={(w) => patch('edge-width', (x) => ({ ...x, style: { ...x.style, strokeWidth: w } }))} />
      <Select
        label="Trait"
        value={dash}
        options={[['solid', 'Plein'], ['dashed', 'Tirets'], ['dotted', 'Pointillés']]}
        onChange={(v) => patch('dash', (x) => ({ ...x, style: { ...x.style, strokeDasharray: v === 'dashed' ? '8 4' : v === 'dotted' ? '2 4' : undefined } }))}
      />
      <Select
        label="Tracé"
        value={e.type ?? 'default'}
        options={[['default', 'Courbe'], ['straight', 'Droit'], ['smoothstep', 'Angles']]}
        onChange={(type) => patch('curve', (x) => ({ ...x, type }))}
      />
      <Select
        label="Flèches"
        value={arrow}
        options={[['none', 'Aucune'], ['end', 'Vers la fin'], ['start', 'Vers le début'], ['both', 'Les deux']]}
        onChange={(mode) => patch('arrow', (x) => ({ ...x, ...withArrow(mode, edgeColor(x)) }))}
      />
    </fieldset>
  )
}
