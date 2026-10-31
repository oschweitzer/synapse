// Côté serveur uniquement : lit les en-têtes posés par lib/supabase/middleware.ts.
import { headers } from 'next/headers'
import { parseRequestContext, type RequestContext } from '@/lib/request-context-headers'

export type { RequestContext }

/** Utilisateur et verrouillage vérifiés par le middleware, ou `null` s'il n'a pas tourné. */
export async function readRequestContext(): Promise<RequestContext | null> {
  return await parseRequestContext(await headers())
}
