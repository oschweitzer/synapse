import { readFileSync } from 'node:fs'
import postgres from 'postgres'
import { assertLocalTarget } from '../guard'
import { databaseUrl } from './env'
import { recreateTestUsers, writeStorageState } from './users'

/** Ouvre une connexion, exécute `fn`, puis la ferme quoi qu'il arrive. */
export async function withSql<T>(fn: (sql: postgres.Sql) => Promise<T>): Promise<T> {
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
 * test et réécrit leurs sessions, puis vide les classeurs Sheets du serveur factice. Chaque spec l'appelle dans `test.beforeAll`.
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
  // Classeurs Google Sheets en mémoire du serveur factice (réutilisé d'une exécution à l'autre).
  const reset = await fetch(`http://127.0.0.1:${process.env.MOCK_PORT || 4010}/__reset`, { method: 'POST' })
  if (!reset.ok) throw new Error(`Réinitialisation du serveur factice impossible : ${reset.status}`)
  await recreateTestUsers()
  await writeStorageState('allowed')
  await writeStorageState('member')
  await writeStorageState('denied')
}

/** Insère une checklist dans la doublure de `public.notes` pour `userId` (privée avec `opts`) ; renvoie son id. */
export async function seedCairnChecklist(
  userId: string,
  title: string,
  opts: { isPrivate?: boolean; codeName?: string } = {},
): Promise<string> {
  assertLocalTarget(process.env)
  return withSql(async (sql) => {
    const [row] = await sql<{ id: string }[]>`
      insert into public.notes (user_id, title, kind, is_private, code_name)
      values (${userId}, ${title}, 'checklist', ${opts.isPrivate ?? false}, ${opts.codeName ?? null})
      returning id
    `
    return row.id
  })
}

/** Insère un dashboard (hors défaut) et ses widgets pour `userId` ; renvoie l'id du dashboard. */
export async function seedDashboard(
  userId: string,
  d: { name: string; visibility: 'public' | 'private'; widgets: string[] },
): Promise<string> {
  assertLocalTarget(process.env)
  return withSql(async (sql) => {
    const [row] = await sql<{ id: string }[]>`
      insert into synapse.dashboards (user_id, name, visibility, is_default, position)
      values (${userId}, ${d.name}, ${d.visibility}, false, 1)
      returning id
    `
    for (const [position, widgetId] of d.widgets.entries()) {
      await sql`
        insert into synapse.dashboard_widgets (dashboard_id, user_id, widget_id, position)
        values (${row.id}, ${userId}, ${widgetId}, ${position})
      `
    }
    return row.id
  })
}

/** Remet le délai d'inactivité du verrouillage de `userId` (5 min par défaut, voir db/migrations/0009_lock.sql). */
export async function setLockIdleMinutes(userId: string, minutes: 0 | 1 | 5 | 15): Promise<void> {
  assertLocalTarget(process.env)
  await withSql(async (sql) => {
    await sql`update synapse.lock set idle_minutes = ${minutes} where user_id = ${userId}`
  })
}
