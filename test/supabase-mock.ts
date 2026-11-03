import { vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

/**
 * Faux client Supabase pour les tests unitaires (aucun réseau, aucune base).
 *
 * - `tables` : résultat par table, pour `client.from(table)` comme pour
 *   `client.schema(nom).from(table)`. Clé `table` (valable pour tous les schémas) ou
 *   `schema.table` (propre à un schéma) ; avec un schéma posé, `schema.table` est cherchée
 *   en premier, puis `table`.
 * - `rpc` : résultat par fonction, pour `client.rpc(fn)` comme `client.schema(nom).rpc(fn)`.
 * - `functions` : résultat par Edge Function, pour `client.functions.invoke(nom)`.
 * - `user` : l'utilisateur renvoyé par `auth.getUser()` ; `testUser()` en fabrique un.
 * - Un résultat seul vaut pour chaque appel ; un tableau est consommé dans l'ordre,
 *   le dernier élément se répétant (ex. lecture puis écriture sur la même table).
 * - Une table ou une fonction non configurée lève tout de suite : un oubli se voit.
 * - `calls` garde chaque méthode de filtre ou d'écriture appelée, pour les assertions.
 */

export type MockResult = { data?: unknown; error?: unknown; count?: number | null }

type Configured = MockResult | MockResult[]

export type MockCall = { schema: string | null; table: string; method: string; args: unknown[] }

/** Méthodes du query builder utilisées par `lib/` : elles se notent et se chaînent. */
const CHAINABLE = ['select', 'eq', 'neq', 'is', 'in', 'gt', 'gte', 'lt', 'order', 'abortSignal', 'limit', 'range', 'update', 'upsert', 'insert', 'delete'] as const

/** Prochain résultat configuré : un résultat seul est répété, un tableau est consommé en place. */
function sequence(config: Configured) {
  let index = 0
  return () => {
    const list = Array.isArray(config) ? config : [config]
    const result: MockResult = list[Math.min(index++, list.length - 1)] ?? {}
    return { data: result.data ?? null, error: result.error ?? null, count: result.count ?? null }
  }
}

/** Utilisateur de test : e-mail confirmé, de quoi passer `isAllowedUser` / `isAdminUser` selon l'environnement. */
export function testUser(email = 'olivier@x.fr', id = 'u1') {
  return { id, email, email_confirmed_at: '2026-01-01T00:00:00Z' }
}

export function mockSupabase(
  opts: {
    tables?: Record<string, MockResult | MockResult[]>
    rpc?: Record<string, MockResult | MockResult[]>
    functions?: Record<string, MockResult | MockResult[]>
    user?: { id: string; email?: string; email_confirmed_at?: string } | null
  } = {},
) {
  const calls: MockCall[] = []
  const tables = new Map(Object.entries(opts.tables ?? {}).map(([name, config]) => [name, sequence(config)]))
  const rpcs = new Map(Object.entries(opts.rpc ?? {}).map(([name, config]) => [name, sequence(config)]))
  const edgeFunctions = new Map(Object.entries(opts.functions ?? {}).map(([name, config]) => [name, sequence(config)]))

  const fromSpy = vi.fn((table: string) => table)

  // Le schéma est lié à la fermeture : `client.from` n'en a pas, `client.schema(nom).from` pose `nom`.
  const open = (schema: string | null) => (table: string) => {
    fromSpy(table)
    const next = (schema ? tables.get(`${schema}.${table}`) : undefined) ?? tables.get(table)
    if (!next) throw new Error(`table non simulée : ${schema ? `${schema}.` : ''}${table}`)
    const builder: Record<string, unknown> = {}
    for (const method of CHAINABLE) {
      builder[method] = (...args: unknown[]) => {
        calls.push({ schema, table, method, args })
        return builder
      }
    }
    builder.maybeSingle = () => Promise.resolve(next())
    builder.single = () => Promise.resolve(next())
    // `await query` et `Promise.all([query, …])` lisent le builder comme une promesse.
    // Attention : renvoyer le builder depuis une fonction `async` l'attend aussi, ce qui
    // consomme une entrée du tableau de résultats. N'utiliser un tableau que là où l'ordre
    // des appels est explicite.
    builder.then = (onFulfilled?: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
      Promise.resolve(next()).then(onFulfilled, onRejected)
    return builder
  }

  // Les arguments ne sont pas lus : `vi.fn` les garde pour `toHaveBeenCalledWith`.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const rpc = vi.fn((fn: string, ..._args: unknown[]) => {
    const next = rpcs.get(fn)
    if (!next) throw new Error(`rpc non simulée : ${fn}`)
    return Promise.resolve(next())
  })

  // Edge Functions : même principe que `rpc`, arguments gardés par `vi.fn`.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const invoke = vi.fn((name: string, ..._args: unknown[]) => {
    const next = edgeFunctions.get(name)
    if (!next) throw new Error(`fonction non simulée : ${name}`)
    return Promise.resolve(next())
  })

  const client = {
    from: open(null),
    schema: (name: string) => ({ from: open(name), rpc }),
    rpc,
    auth: {
      getUser: async () => ({ data: { user: opts.user ?? null }, error: null }),
      signOut: vi.fn(async () => ({ error: null })),
    },
    functions: { invoke },
  } as unknown as SupabaseClient

  return { client, from: fromSpy, rpc, invoke, calls }
}

/**
 * `mockSupabase` branché sur `createClient` de `@/lib/supabase/server`, pour les tests des server
 * actions et des route handlers. Le fichier de test doit déclarer
 * `vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))` : sans cela, `vi.mocked`
 * ne porte pas sur un mock.
 */
export function mockServerClient(opts: Parameters<typeof mockSupabase>[0] = {}) {
  const mock = mockSupabase(opts)
  vi.mocked(createClient).mockResolvedValue(mock.client as never)
  return mock
}
