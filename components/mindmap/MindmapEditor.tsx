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
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  reconnectEdge,
  useReactFlow,
  type Connection,
  type EdgeChange,
  type NodeChange,
  type Viewport,
  type XYPosition,
} from '@xyflow/react'
import { toPng } from 'html-to-image'
import { saveMindmap, type MindmapPatch } from '@/app/actions/mindmaps'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { ColorSwatches, ToolButton, ToolGroup, Toolbox } from '@/components/ui/Toolbox'
import { MindHistoryContext } from './history'
import { MindNodeView } from './MindNodeView'
import { applyEdgeStyle, newEdge, readEdgeStyle } from './edgeStyle'
import { newNode } from './newNode'
import {
  DEFAULT_STYLE,
  EDGE_ARROWS,
  EDGE_DASHES,
  EDGE_ROUTES,
  EDGE_WIDTHS,
  FONT_SIZES,
  isShapeTool,
  NODE_WIDTHS,
  SHAPES,
  type MindEdge,
  type MindNode,
  type NodeData,
  type NodeStyleValues,
  type Shape,
  type Tool,
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
  const [tool, setTool] = useState<Tool>('select')
  const [nodeDefaults, setNodeDefaults] = useState<NodeStyleValues>(DEFAULT_STYLE)
  // Écran tactile : un glissé d'un doigt déplace la carte (pas de bouton milieu / droit).
  const [coarse, setCoarse] = useState(false)
  useEffect(() => {
    const query = window.matchMedia('(pointer: coarse)')
    const sync = () => setCoarse(query.matches)
    sync()
    query.addEventListener('change', sync)
    return () => query.removeEventListener('change', sync)
  }, [])

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

  const addNode = (shape: Shape, flowPosition: XYPosition) => {
    record()
    const node = newNode(shape, flowPosition, nodeDefaults)
    setNodes((n) => [...n.map((x) => ({ ...x, selected: false })), node])
    setEdges((e) => e.map((x) => ({ ...x, selected: false })))
  }

  // Une forme choisie dans la boîte à outils se place d'un clic sur le canevas vide.
  const onPaneClick = (event: React.MouseEvent) => {
    if (!isShapeTool(tool)) return
    addNode(tool, screenToFlowPosition({ x: event.clientX, y: event.clientY }))
    setTool('select')
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
  // Même chemin que la touche Suppr : les liens des nœuds partent avec eux.
  const deleteSelection = () => {
    const picked = nodesRef.current.filter((n) => n.selected)
    const pickedEdges = edgesRef.current.filter((e) => e.selected)
    if (!picked.length && !pickedEdges.length) return
    record()
    const gone = new Set(picked.map((n) => n.id))
    setNodes((all) => all.filter((n) => !n.selected))
    setEdges((all) => all.filter((e) => !e.selected && !gone.has(e.source) && !gone.has(e.target)))
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
      if (e.key === 'Escape') {
        setTool('select')
        return
      }
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
  // Clavier : activer une forme au clavier la place au centre du canevas, faute de clic.
  const pickShape = (shape: Shape, event: React.MouseEvent) => {
    if (event.detail === 0) {
      const box = wrapper.current?.getBoundingClientRect()
      if (!box) return
      addNode(shape, screenToFlowPosition({ x: box.left + box.width / 2, y: box.top + box.height / 2 }))
      setTool('select')
      return
    }
    // Un second clic sur la forme active la désarme (utile sans touche Échap).
    setTool(tool === shape ? 'select' : shape)
  }

  // En mode Déplacement la sélection n'est plus visible ni modifiable : on la vide.
  const pickPan = () => {
    setNodes((n) => n.map((x) => ({ ...x, selected: false })))
    setEdges((e) => e.map((x) => ({ ...x, selected: false })))
    setTool('pan')
  }

  useEffect(() => {
    const listener = (e: KeyboardEvent) => shortcuts.current(e)
    window.addEventListener('keydown', listener)
    return () => window.removeEventListener('keydown', listener)
  }, [])

  const selectedNodes = nodes.filter((n) => n.selected)
  const selectedEdges = edges.filter((e) => e.selected)
  // Sans nœud sélectionné, les pastilles règlent le style des prochains nœuds.
  const styleSource: NodeStyleValues = selectedNodes[0]?.data ?? nodeDefaults
  const setStyle = (key: keyof NodeStyleValues, patch: Partial<NodeStyleValues>) => {
    if (selectedNodes.length) patchNodes(key, patch)
    else setNodeDefaults((d) => ({ ...d, ...patch }))
  }
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

        {selectedEdges.length > 0 && (
          <div className="flex flex-wrap items-end gap-x-6 gap-y-2 border-b border-[var(--line-500)] px-3 py-2 text-xs">
            <EdgeStyle edges={selectedEdges} patch={patchEdges} />
          </div>
        )}

        <div ref={wrapper} className="hud-mindmap relative min-h-0 flex-1" data-tool={isShapeTool(tool) ? 'shape' : tool}>
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
            onPaneClick={onPaneClick}
            panOnDrag={tool === 'pan' || coarse ? true : [1, 2]}
            selectionOnDrag={tool === 'select' && !coarse}
            onNodeClick={() => isShapeTool(tool) && setTool('select')}
            elementsSelectable={tool !== 'pan'}
            nodesDraggable={tool !== 'pan'}
            nodesConnectable={tool !== 'pan'}
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
            <Controls showInteractive={false} position="top-right" />
            <MiniMap pannable zoomable nodeColor={(n) => (n.data as NodeData).stroke} maskColor="rgba(5,8,13,.7)" style={{ background: '#0a111a' }} />
          </ReactFlow>
          <Toolbox label="Outils de la carte" className="hud-toolbox--canvas">
            <ToolGroup title="Outils">
              <ToolButton name="pointer" label="Sélection" pressed={tool === 'select'} onClick={() => setTool('select')} />
              <ToolButton name="hand" label="Déplacement" pressed={tool === 'pan'} onClick={pickPan} />
              <ToolButton name="undo" label="Annuler" title="Annuler (Ctrl+Z)" disabled={!depth.past} onClick={undo} />
              <ToolButton name="redo" label="Rétablir" title="Rétablir (Ctrl+Y)" disabled={!depth.future} onClick={redo} />
              <ToolButton name="copy" label="Dupliquer" title="Dupliquer (Ctrl+D)" disabled={!selectedNodes.length} onClick={duplicate} />
              <ToolButton name="trash" label="Supprimer" title="Supprimer (Suppr)" disabled={!selectedNodes.length && !selectedEdges.length} onClick={deleteSelection} />
            </ToolGroup>
            <ToolGroup title="Formes">
              {SHAPES.map((s) => (
                <ToolButton key={s.value} name={s.icon} label={s.label} pressed={tool === s.value} onClick={(e) => pickShape(s.value, e)} />
              ))}
            </ToolGroup>
            <ToolGroup title="Remplissage">
              <div className="hud-toolgroup__full">
                <ColorSwatches label="Couleur de remplissage" allowNone value={styleSource.fill} onChange={(fill) => setStyle('fill', { fill })} />
              </div>
            </ToolGroup>
            <ToolGroup title="Bordure">
              <div className="hud-toolgroup__full flex flex-col gap-2">
                <ColorSwatches label="Couleur de bordure" value={styleSource.stroke} onChange={(stroke) => setStyle('stroke', { stroke })} />
                <select
                  aria-label="Épaisseur de bordure"
                  className="hud-input hud-input--sm"
                  value={String(styleSource.strokeWidth)}
                  onChange={(e) => setStyle('strokeWidth', { strokeWidth: Number(e.target.value) })}
                >
                  {NODE_WIDTHS.map((w) => (
                    <option key={w} value={w}>
                      {w} px
                    </option>
                  ))}
                </select>
              </div>
            </ToolGroup>
            <ToolGroup title="Texte">
              <div className="hud-toolgroup__full flex flex-col gap-2">
                <ColorSwatches label="Couleur du texte" value={styleSource.textColor} onChange={(textColor) => setStyle('textColor', { textColor })} />
                <select
                  aria-label="Taille du texte"
                  className="hud-input hud-input--sm"
                  value={String(styleSource.fontSize)}
                  onChange={(e) => setStyle('fontSize', { fontSize: Number(e.target.value) })}
                >
                  {FONT_SIZES.map((f) => (
                    <option key={f} value={f}>
                      {f} px
                    </option>
                  ))}
                </select>
              </div>
            </ToolGroup>
          </Toolbox>
        </div>
      </div>
    </MindHistoryContext.Provider>
  )
}

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

function EdgeStyle({ edges, patch }: { edges: MindEdge[]; patch: (key: string, fn: (e: MindEdge) => MindEdge) => void }) {
  const e = edges[0]
  const { route, arrow, dash, width, color } = readEdgeStyle(e)
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
        onChange={(c) => patch('edge-color', (x) => applyEdgeStyle(x, { color: c }))}
      />
      <Select label="Épaisseur du lien" value={width} options={EDGE_WIDTHS.map((w) => [w, `${w} px`])} onChange={(w) => patch('edge-width', (x) => applyEdgeStyle(x, { width: w }))} />
      <Select
        label="Trait"
        value={dash}
        options={EDGE_DASHES.map((d) => [d.value, d.label])}
        onChange={(v) => patch('dash', (x) => applyEdgeStyle(x, { dash: v }))}
      />
      <Select
        label="Tracé"
        value={route}
        options={EDGE_ROUTES.map((r) => [r.value, r.label])}
        onChange={(type) => patch('curve', (x) => applyEdgeStyle(x, { route: type }))}
      />
      <Select
        label="Flèches"
        value={arrow}
        options={EDGE_ARROWS.map((a) => [a.value, a.label])}
        onChange={(mode) => patch('arrow', (x) => applyEdgeStyle(x, { arrow: mode }))}
      />
    </fieldset>
  )
}
