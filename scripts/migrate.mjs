// Applique les migrations du schéma `synapse` (db/migrations/*.sql) sur DATABASE_URL.
// Le projet Supabase est partagé avec Cairn, dont le CLI gère l'historique : Synapse
// garde le sien dans synapse.schema_migrations et ne touche jamais aux tables public.*.
//
//   node scripts/migrate.mjs            applique les migrations en attente
//   node scripts/migrate.mjs --status   liste les migrations et leur état, sans rien appliquer
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import postgres from 'postgres'

const DIR = 'db/migrations'
// Verrou consultatif propre à Synapse, pour éviter deux exécutions simultanées.
const LOCK_ID = 727_365_001
// Toute instruction qui crée, modifie ou supprime un objet de public.* est refusée.
const FORBIDDEN = /\b(create|alter|drop|truncate|comment\s+on|grant|revoke)\b[^;]*\bpublic\s*\./i

try {
  process.loadEnvFile('.env.local')
} catch {
  // Pas de .env.local : DATABASE_URL vient de l'environnement.
}

const url = process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL manquant (Supabase > Connect > Session pooler).')
  process.exit(1)
}

const statusOnly = process.argv.includes('--status')

const files = readdirSync(DIR)
  .filter((f) => /^\d{4}_[\w-]+\.sql$/.test(f))
  .sort()
  .map((name) => {
    const sql = readFileSync(join(DIR, name), 'utf8')
    return { name, sql, checksum: createHash('sha256').update(sql).digest('hex') }
  })

for (const { name, sql } of files) {
  const withoutComments = sql.replace(/--.*$/gm, '')
  if (FORBIDDEN.test(withoutComments)) {
    console.error(`${name} : modifie le schéma public (Cairn). Refusé.`)
    process.exit(1)
  }
}

const db = postgres(url, { max: 1, onnotice: () => {} })

try {
  await db`select pg_advisory_lock(${LOCK_ID})`
  await db`create schema if not exists synapse`
  await db`
    create table if not exists synapse.schema_migrations (
      name text primary key,
      checksum text not null,
      applied_at timestamptz not null default now()
    )
  `
  await db`revoke all on synapse.schema_migrations from public`

  const applied = new Map(
    (await db`select name, checksum from synapse.schema_migrations`).map((r) => [r.name, r.checksum]),
  )

  for (const { name, checksum } of files) {
    if (applied.has(name) && applied.get(name) !== checksum) {
      throw new Error(`${name} a été modifiée après son application. Écrire une nouvelle migration.`)
    }
  }

  const pending = files.filter((f) => !applied.has(f.name))

  if (statusOnly) {
    for (const { name } of files) console.log(`${applied.has(name) ? '✓' : '·'} ${name}`)
    console.log(pending.length ? `${pending.length} en attente.` : 'À jour.')
  } else {
    for (const { name, sql, checksum } of pending) {
      await db.begin(async (tx) => {
        await tx.unsafe(sql)
        await tx`insert into synapse.schema_migrations (name, checksum) values (${name}, ${checksum})`
      })
      console.log(`✓ ${name}`)
    }
    console.log(pending.length ? `${pending.length} migration(s) appliquée(s).` : 'Rien à appliquer.')
  }
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
} finally {
  await db.end()
}
