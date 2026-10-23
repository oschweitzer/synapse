// Régénère lib/types/synapse.ts et lib/types/cairn.ts depuis le projet Supabase partagé.
// Nécessite `supabase login` et SUPABASE_PROJECT_REF (dans .env.local ou l'environnement).
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'

try {
  process.loadEnvFile('.env.local')
} catch {
  // Pas de .env.local : SUPABASE_PROJECT_REF vient de l'environnement.
}

const ref = process.env.SUPABASE_PROJECT_REF
if (!ref) {
  console.error('SUPABASE_PROJECT_REF manquant (Supabase > Settings > General > Project ID).')
  process.exit(1)
}

mkdirSync('lib/types', { recursive: true })
for (const [schema, file] of [
  ['synapse', 'lib/types/synapse.ts'],
  ['public', 'lib/types/cairn.ts'],
]) {
  const types = execFileSync(
    'supabase',
    ['gen', 'types', 'typescript', '--project-id', ref, '--schema', schema],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] },
  )
  writeFileSync(file, types)
  console.log(`✓ ${file}`)
}
