'use client'

import { useEffect, useRef, useState } from 'react'
import { Handle, NodeResizer, Position, useReactFlow, type NodeProps } from '@xyflow/react'
import { useMindHistory } from './history'
import type { MindNode, Shape } from './types'

const SIDES = [Position.Top, Position.Right, Position.Bottom, Position.Left]

function ShapeBackground({ shape, fill, stroke, strokeWidth }: { shape: Shape; fill: string; stroke: string; strokeWidth: number }) {
  if (shape === 'text') return null
  const common = { fill, stroke, strokeWidth, vectorEffect: 'non-scaling-stroke' as const }
  return (
    <svg className="absolute inset-0 h-full w-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
      {shape === 'rect' && <rect x="0" y="0" width="100" height="100" {...common} />}
      {shape === 'rounded' && <rect x="0" y="0" width="100" height="100" rx="12" ry="12" {...common} />}
      {shape === 'ellipse' && <ellipse cx="50" cy="50" rx="50" ry="50" {...common} />}
      {shape === 'diamond' && <polygon points="50,0 100,50 50,100 0,50" {...common} />}
    </svg>
  )
}

/** Nœud : forme + texte éditable (double-clic), redimensionnable, 4 points d'accroche. */
export function MindNodeView({ id, data, selected }: NodeProps<MindNode>) {
  const { updateNodeData } = useReactFlow()
  const { record } = useMindHistory()
  const [editing, setEditing] = useState(false)
  const area = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (editing) area.current?.select()
  }, [editing])

  const padded = data.shape === 'diamond' || data.shape === 'ellipse' ? '18%' : '8px'

  return (
    <div
      className="relative h-full w-full"
      style={{ minWidth: 60, minHeight: 36 }}
      onDoubleClick={() => {
        record()
        setEditing(true)
      }}
    >
      <NodeResizer isVisible={selected} minWidth={60} minHeight={36} onResizeStart={record} lineStyle={{ borderColor: '#3fd8f2' }} handleStyle={{ width: 8, height: 8 }} />
      <ShapeBackground shape={data.shape} fill={data.fill} stroke={data.stroke} strokeWidth={data.strokeWidth} />
      <div
        className="absolute inset-0 flex items-center justify-center text-center"
        style={{ padding: padded, color: data.textColor, fontSize: data.fontSize }}
      >
        {editing ? (
          <textarea
            ref={area}
            autoFocus
            value={data.label}
            aria-label="Texte du nœud"
            className="nodrag nowheel h-full w-full resize-none bg-transparent text-center outline-none"
            style={{ color: 'inherit', font: 'inherit' }}
            onChange={(e) => updateNodeData(id, { label: e.target.value })}
            onBlur={() => setEditing(false)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setEditing(false)
              e.stopPropagation()
            }}
          />
        ) : (
          <span className="max-h-full w-full overflow-hidden whitespace-pre-wrap break-words">{data.label || ' '}</span>
        )}
      </div>
      {SIDES.map((side) => (
        <Handle key={side} id={side} type="source" position={side} className="!h-2.5 !w-2.5 !border-0 !bg-[#3fd8f2]" />
      ))}
    </div>
  )
}
