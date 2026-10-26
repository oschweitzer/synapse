import type { NextRequest } from 'next/server'
import { addCategory } from '@/lib/connectors/cash'
import { field, respond } from '../respond'

/** Nouvelle catégorie `{ name }`, ajoutée à l'onglet `Catégories`. Déjà présente : rendue telle quelle. */
export async function POST(request: NextRequest) {
  return respond(request, async (body) => ({ name: await addCategory(field(body, 'name')) }))
}
