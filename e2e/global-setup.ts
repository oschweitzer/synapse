import { execFileSync } from 'node:child_process'
import { assertLocalTarget } from './guard'
import { applyCairnStubs, resetDatabase } from './support/db'

/** Avant tout test : garde-fou, migrations de Synapse, doublure de Cairn, base propre. */
export default async function globalSetup() {
  // Avant toute entrée/sortie : on refuse de toucher une base qui n'est pas locale.
  assertLocalTarget(process.env)

  // scripts/migrate.mjs charge .env.local sans écraser le DATABASE_URL déjà défini.
  execFileSync('npm', ['run', 'db:migrate'], { stdio: 'inherit', env: process.env })

  await applyCairnStubs()
  await resetDatabase()
}
