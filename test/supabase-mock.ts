import { vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Faux client Supabase pour les tests unitaires (aucun réseau, aucune base).
 *
 * - `tables` : résultat par table, pour `client.from(table)` comme pour
 *   `client.schema(nom).from(table)`. Clé `table` (valable pour tous les schémas) ou
 *   `schema.table` (propre à un schéma) ; avec un schéma posé, `schema.table` est cherchée
 *   en premier, puis `table`.
 * - `rpc` : résultat par fonction, pour `client.rpc(fn)` comme `client.schema(nom).rpc(fn)`.
 * - Un résultat seul vaut pour chaque appel ; un tableau est consommé dans l'ordre,
 *   le dernier élément se répétant (ex. lecture puis écriture sur la même table).
 * - Une table ou une fonction non configurée lève tout de suite : un oubli se voit.
 * - `calls` garde chaque méthode de filtre ou d'écriture appelée, pour les assertions.
 */

export type MockResult = { data?: unknown; error?: unknown }

type Configured = MockResult | MockResult[]

export type MockCall = { schema: string | null; table: string; method: string; args: unknown[] }

/** Méthodes du query builder utilisées par `lib/` : elles se notent et se chaînent. */
const CHAINABLE = ['select', 'eq', 'neq', 'is', 'in', 'gt', 'gte', 'lt', 'order', 'limit', 'update', 'upsert', 'insert', 'delete'] as const

/** Prochain résultat configuré : un résultat seul est répété, un tableau est consommé en place. */
function sequence(config: Configured) {
  let index = 0
  return () => {
    const list = Array.isArray(config) ? config : [config]
    const result: MockResult = list[Math.min(index++, list.length - 1)] ?? {}
    return { data: result.data ?? null, error: result.error ?? null }
  }
}

export function mockSupabase(
  opts: {
    tables?: Record<string, MockResult | MockResult[]>
    rpc?: Record<string, MockResult | MockResult[]>
    user?: { id: string } | null
  } = {},
) {
  const calls: MockCall[] = []
  const tables = new Map(Object.entries(opts.tables ?? {}).map(([name, config]) => [name, sequence(config)]))
  const functions = new Map(Object.entries(opts.rpc ?? {}).map(([name, config]) => [name, sequence(config)]))

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
    const next = functions.get(fn)
    if (!next) throw new Error(`rpc non simulée : ${fn}`)
    return Promise.resolve(next())
  })

  const client = {
    from: open(null),
    schema: (name: string) => ({ from: open(name), rpc }),
    rpc,
    auth: {
      getUser: async () => ({ data: { user: opts.user ?? null }, error: null }),
    },
  } as unknown as SupabaseClient

  return { client, from: fromSpy, rpc, calls }
}
