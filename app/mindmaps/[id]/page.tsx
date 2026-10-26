import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { MindmapEditor } from '@/components/mindmap/MindmapEditor'
import type { MindEdge, MindNode } from '@/components/mindmap/types'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function MindmapPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID.test(id)) notFound()

  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) redirect('/login')

  const { data: map, error } = await supabase
    .schema('synapse')
    .from('mindmaps')
    .select('id, title, nodes, edges, viewport')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  if (!map) notFound()

  return (
    <MindmapEditor
      id={map.id}
      initialTitle={map.title}
      initialNodes={map.nodes as unknown as MindNode[]}
      initialEdges={map.edges as unknown as MindEdge[]}
      initialViewport={(map.viewport as { x: number; y: number; zoom: number } | null) ?? undefined}
    />
  )
}
