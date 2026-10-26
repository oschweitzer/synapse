import type { NextRequest } from 'next/server'
import { linkSheet, unlinkSheet } from '@/lib/connectors/cash'
import { field, respond } from '../respond'

/** Fichier choisi dans le Google Picker `{ id }`. */
export async function PUT(request: NextRequest) {
  return respond(request, (body) => linkSheet(field(body, 'id')))
}

/** Oublie le fichier choisi. */
export async function DELETE(request: NextRequest) {
  return respond(request, () => unlinkSheet())
}
