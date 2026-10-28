import { readFileSync } from 'node:fs'
import postgres from 'postgres'
import { assertLocalTarget } from '../guard'
import { databaseUrl } from './env'
import { recreateTestUsers, writeStorageState } from './users'

/** Ouvre une connexion, exécute `fn`, puis la ferme quoi qu'il arrive. */
async function withSql<T>(fn: (sql: postgres.Sql) => Promise<T>): Promise<T> {
  assertLocalTarget(process.env)
  const sql = postgres(databaseUrl(), { max: 1, onnotice: () => {} })
  try {
    return await fn(sql)
  } finally {
    await sql.end()
  }
}

/** Crée les tables Cairn de test, puis demande à PostgREST de relire le schéma. */
export async function applyCairnStubs() {
  assertLocalTarget(process.env)
  const script = readFileSync('e2e/fixtures/cairn-stubs.sql', 'utf8')
  await withSql(async (sql) => {
    await sql.unsafe(script)
    await sql`notify pgrst, 'reload schema'`
  })
}

const quote = (name: string) => `"${name.replaceAll('"', '""')}"`

/**
 * Vide les tables de Synapse et les doublures de Cairn, recrée les utilisateurs de
 * test et réécrit leurs sessions. Chaque spec l'appelle dans `test.beforeAll`.
 */
export async function resetDatabase() {
  assertLocalTarget(process.env)
  await withSql(async (sql) => {
    const tables = await sql<{ tablename: string }[]>`
      select tablename from pg_tables
      where schemaname = 'synapse' and tablename <> 'schema_migrations'
    `
    if (tables.length > 0) {
      const list = tables.map((t) => `synapse.${quote(t.tablename)}`).join(', ')
      await sql.unsafe(`truncate table ${list} restart identity cascade`)
    }
    // Doublures de test de Cairn (voir e2e/fixtures/cairn-stubs.sql).
    await sql.unsafe('truncate table public.reminders, public.checklist_items, public.notes cascade')
  })
  await recreateTestUsers()
  await writeStorageState('allowed')
  await writeStorageState('denied')
}
