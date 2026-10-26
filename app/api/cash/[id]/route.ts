import type { NextRequest } from 'next/server'
import { deleteEntry, updateEntry } from '@/lib/connectors/cash'
import { respond } from '../respond'

type Params = { params: Promise<{ id: string }> }

/** Modifie la dépense, retrouvée par son ID. */
export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params
  return respond(request, (body) => updateEntry(id, body))
}

/** Supprime la ligne de la dépense, retrouvée par son ID. */
export async function DELETE(request: NextRequest, { params }: Params) {
  const { id } = await params
  return respond(request, () => deleteEntry(id))
}
