import type { NextRequest } from 'next/server'
import type { Correction } from '@/lib/cash-migration'
import { runMigration } from '@/lib/connectors/cash'
import { field, respond } from '../respond'

/** Migration du fichier, avec les corrections validées dans l'aperçu `{ corrections: { [ligne]: … } }`. */
export async function POST(request: NextRequest) {
  return respond(request, async (body) => {
    const raw = field(body, 'corrections')
    const corrections = raw && typeof raw === 'object' ? (raw as Record<string, Correction>) : {}
    return runMigration(corrections)
  })
}
